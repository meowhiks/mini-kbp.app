"""Staff: просмотр/правка профиля студента + блокировка."""

from __future__ import annotations

from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import AppAccount, Student, Teacher
from academics.models import Enrollment, GroupCurator, TeachingAssignment


def _teacher_or_admin(user) -> Teacher | None:
    if not user.is_authenticated:
        return None
    if user.is_superuser or user.is_staff:
        return getattr(user, "teacher_profile", None) or Teacher.objects.filter(user=user).first()
    return getattr(user, "teacher_profile", None)


def _can_access_student(user, student: Student) -> bool:
    if user.is_superuser or user.is_staff:
        return True
    teacher = getattr(user, "teacher_profile", None)
    if not teacher:
        return False
    group_ids = Enrollment.objects.filter(student=student, is_active=True).values_list("group_id", flat=True)
    if TeachingAssignment.objects.filter(teacher=teacher, group_id__in=group_ids, is_active=True).exists():
        return True
    return GroupCurator.objects.filter(teacher=teacher, group_id__in=group_ids).exists()


def _is_curator_for_student(user, student: Student) -> bool:
    if user.is_superuser or user.is_staff:
        return True
    teacher = getattr(user, "teacher_profile", None)
    if not teacher:
        return False
    group_ids = Enrollment.objects.filter(student=student, is_active=True).values_list("group_id", flat=True)
    return GroupCurator.objects.filter(teacher=teacher, group_id__in=group_ids).exists()


def _payload(student: Student, account: AppAccount | None, user) -> dict:
    base = {
        "student_id": student.id,
        "full_name": student.full_name,
        "record_book_number": student.record_book_number,
        "has_app_account": account is not None,
    }
    if not account:
        return {
            **base,
            "email": student.email or "",
            "phone": student.phone or "",
            "display_name": student.full_name,
            "nickname": "",
            "info": "",
            "gender": "",
            "avatar_url": "",
            "profile_locked": False,
            "profile_locked_at": None,
            "profile_locked_by_name": None,
            "can_edit_fio": _is_curator_for_student(user, student),
        }
    locker = account.profile_locked_by
    return {
        **base,
        "email": account.email or "",
        "phone": account.phone or "",
        "display_name": account.display_name or "",
        "nickname": account.nickname or "",
        "info": account.info or "",
        "gender": account.gender or "",
        "avatar_url": account.avatar_url or "",
        "telegram_username": account.telegram_username or "",
        "profile_locked": account.profile_locked,
        "profile_locked_at": account.profile_locked_at.isoformat() if account.profile_locked_at else None,
        "profile_locked_by_name": locker.full_name if locker else None,
        "can_edit_fio": _is_curator_for_student(user, student),
    }


class StaffStudentAppProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, student_id: int):
        student = Student.objects.filter(pk=student_id).first()
        if not student:
            return Response({"detail": "Студент не найден"}, status=404)
        if not _can_access_student(request.user, student):
            return Response({"detail": "Нет доступа"}, status=403)
        account = AppAccount.objects.filter(student=student).select_related("profile_locked_by").first()
        if not account:
            account = AppAccount.objects.filter(user=student.user).select_related("profile_locked_by").first() if student.user_id else None
        return Response(_payload(student, account, request.user))

    def patch(self, request, student_id: int):
        student = Student.objects.filter(pk=student_id).first()
        if not student:
            return Response({"detail": "Студент не найден"}, status=404)
        if not _can_access_student(request.user, student):
            return Response({"detail": "Нет доступа"}, status=403)

        account = AppAccount.objects.filter(student=student).first()
        if not account and student.user_id:
            account = AppAccount.objects.filter(user=student.user).first()

        data = request.data
        teacher = _teacher_or_admin(request.user)

        if "display_name" in data:
            if not _is_curator_for_student(request.user, student):
                return Response({"detail": "ФИО может менять только куратор группы"}, status=403)
            full_name = str(data.get("display_name") or "")[:255]
            student.full_name = full_name
            student.save(update_fields=["full_name"])
            if account:
                account.display_name = full_name

        if not account:
            if any(k in data for k in ("nickname", "phone", "info", "gender", "profile_locked")):
                return Response({"detail": "У студента нет аккаунта ЛК"}, status=400)
            return Response(_payload(student, None, request.user))

        if "profile_locked" in data:
            locked = bool(data.get("profile_locked"))
            account.profile_locked = locked
            if locked:
                account.profile_locked_at = timezone.now()
                account.profile_locked_by = teacher
            else:
                account.profile_locked_at = None
                account.profile_locked_by = None

        for field in ("nickname", "phone", "info", "gender"):
            if field in data:
                val = str(data.get(field) or "")
                if field == "nickname":
                    account.nickname = val[:64]
                elif field == "phone":
                    account.phone = val[:32]
                elif field == "info":
                    account.info = val[:2000]
                elif field == "gender" and val in ("", "male", "female", "other"):
                    account.gender = val

        account.save()
        return Response(_payload(student, account, request.user))
