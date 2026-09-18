"""Автоматическая привязка AppAccount ↔ Student."""

from __future__ import annotations

import secrets

from django.contrib.auth import get_user_model
from django.utils import timezone

from accounts.models import AppAccount, Student
from academics.models import Enrollment, Group

User = get_user_model()


def _students_in_group(group: Group) -> list[Student]:
    return [
        e.student
        for e in Enrollment.objects.filter(group=group, is_active=True).select_related("student")
        if e.student.is_active
    ]


def find_student_for_account(account: AppAccount, group: Group) -> Student | None:
    """Ищет существующего студента группы для аккаунта (без создания нового)."""
    students = _students_in_group(group)

    if account.student_id:
        for st in students:
            if st.id == account.student_id:
                return st

    email = (account.email or "").strip().lower()
    if email:
        by_email = [s for s in students if (s.email or "").strip().lower() == email]
        if len(by_email) == 1:
            return by_email[0]

    dn = (account.display_name or "").strip().lower()
    if dn:
        by_name = [s for s in students if s.full_name.strip().lower() == dn]
        if len(by_name) == 1:
            return by_name[0]
        parts = dn.split()
        if parts:
            surname = parts[0]
            by_surname = [
                s for s in students if s.full_name.strip().lower().split()[0] == surname
            ]
            if len(by_surname) == 1:
                return by_surname[0]

    if account.user_id:
        profile = getattr(account.user, "student_profile", None)
        if profile and profile.is_active and any(s.id == profile.id for s in students):
            return profile

    return None


def ensure_student_user(student: Student) -> User:
    if student.user_id:
        return student.user
    base = f"st{student.record_book_number or student.id}"
    username = base
    n = 0
    while User.objects.filter(username=username).exists():
        n += 1
        username = f"{base}_{n}"
    user = User.objects.create_user(username=username, password=secrets.token_urlsafe(24))
    student.user = user
    student.save(update_fields=["user"])
    return user


def link_account_to_student(account: AppAccount, student: Student, group: Group) -> Student:
    """Связывает аккаунт и студента, синхронизирует user и зачисление."""
    ensure_student_user(student)

    if not student.user_id:
        student.user = account.user
        student.save(update_fields=["user"])
    elif not account.user_id:
        account.user = student.user

    account.student = student
    if not account.group_id:
        account.group = group
    if not account.group_verified_at:
        account.group_verified_at = timezone.now()
    if not account.display_name and student.full_name:
        account.display_name = student.full_name
    if not account.email and student.email:
        account.email = student.email

    account.save(
        update_fields=[
            "student",
            "user",
            "group",
            "group_verified_at",
            "display_name",
            "email",
        ]
    )
    Enrollment.objects.get_or_create(student=student, group=group, defaults={"is_active": True})
    return student


def ensure_student_for_account(account: AppAccount, group: Group) -> Student:
    """Привязать к существующему студенту группы или создать нового."""
    existing = find_student_for_account(account, group)
    if existing:
        return link_account_to_student(account, existing, group)

    if account.student_id:
        student = account.student
        Enrollment.objects.get_or_create(student=student, group=group, defaults={"is_active": True})
        return student

    name = account.display_name or account.email or f"Студент {account.telegram_id or account.id}"
    rb_base = f"APP-{account.id}"
    rb = rb_base
    n = 0
    while Student.objects.filter(record_book_number=rb).exists():
        n += 1
        rb = f"{rb_base}-{n}"

    student = Student.objects.create(
        full_name=name,
        record_book_number=rb,
        email=account.email or "",
        user=account.user,
        is_active=True,
    )
    return link_account_to_student(account, student, group)


def resolve_impersonation(student: Student) -> tuple[User, AppAccount, Group | None]:
    """Подготовка «Войти как студент» из админки."""
    user = ensure_student_user(student)

    account = AppAccount.objects.filter(student=student).select_related("group").first()
    if not account:
        account = AppAccount.objects.filter(user=user).select_related("group").first()
    if not account and student.email:
        account = AppAccount.objects.filter(email__iexact=student.email).select_related("group").first()

    enr = (
        Enrollment.objects.filter(student=student, is_active=True)
        .select_related("group")
        .order_by("-enrolled_at")
        .first()
    )
    group = (account.group if account and account.group_id else None) or (enr.group if enr else None)

    if not account:
        account = AppAccount.objects.create(
            user=user,
            student=student,
            email=student.email or None,
            display_name=student.full_name,
            group=group,
            group_verified_at=timezone.now() if group else None,
        )
    elif group:
        link_account_to_student(account, student, group)
        account = AppAccount.objects.select_related("group").get(pk=account.pk)
    elif not account.student_id:
        account.student = student
        account.user = user
        account.save(update_fields=["student", "user"])

    return user, account, account.group if account.group_id else group


def try_link_account_by_email(account: AppAccount) -> bool:
    if account.student_id or not account.email:
        return False
    email = account.email.strip().lower()
    student = Student.objects.filter(email__iexact=email, is_active=True).first()
    if not student:
        return False
    enr = Enrollment.objects.filter(student=student, is_active=True).select_related("group").first()
    if not enr:
        return False
    link_account_to_student(account, student, enr.group)
    return True


def try_link_student_by_email(student: Student) -> bool:
    if not student.email:
        return False
    account = AppAccount.objects.filter(email__iexact=student.email, student__isnull=True).first()
    if not account:
        return False
    enr = Enrollment.objects.filter(student=student, is_active=True).select_related("group").first()
    if not enr:
        return False
    link_account_to_student(account, student, enr.group)
    return True


def ensure_app_account_for_student_login(student: Student, group: Group, user) -> AppAccount:
    """После входа по фамилии/ДР — связать с AppAccount для уведомлений и /app."""
    account = AppAccount.objects.filter(student=student).first()
    if not account:
        account = AppAccount.objects.filter(user=user).first()
    if not account and student.email:
        account = AppAccount.objects.filter(email__iexact=student.email).first()
    if account:
        link_account_to_student(account, student, group)
        return account
    account = AppAccount.objects.create(
        user=user,
        student=student,
        email=student.email or None,
        display_name=student.full_name,
        group=group,
        group_verified_at=timezone.now(),
    )
    Enrollment.objects.get_or_create(student=student, group=group, defaults={"is_active": True})
    return account
