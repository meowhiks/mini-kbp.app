"""Role-scoped queryset helpers for academics API."""

from __future__ import annotations

from accounts.models import AppAccount
from accounts.student_views import _resolve_student_user
from academics.journal_views import _teacher_profile, _visible_assignments
from academics.models import Enrollment, GroupCurator, TeachingAssignment


def accessible_group_ids(user) -> set[int] | None:
    """Return allowed group ids; None means unrestricted (staff)."""
    if user.is_staff:
        return None

    teacher = _teacher_profile(user)
    if teacher:
        own = TeachingAssignment.objects.filter(
            teacher=teacher, is_active=True
        ).values_list("group_id", flat=True)
        curated = GroupCurator.objects.filter(teacher=teacher).values_list(
            "group_id", flat=True
        )
        return set(own) | set(curated)

    student = _resolve_student_user(user)
    if student:
        ids = set(
            Enrollment.objects.filter(student=student, is_active=True).values_list(
                "group_id", flat=True
            )
        )
        group_id = (
            AppAccount.objects.filter(user=user).values_list("group_id", flat=True).first()
        )
        if group_id:
            ids.add(group_id)
        return ids

    return set()


def user_can_access_group(user, group_id: int) -> bool:
    allowed = accessible_group_ids(user)
    return allowed is None or group_id in allowed


def filter_groups_queryset(user, qs):
    allowed = accessible_group_ids(user)
    if allowed is None:
        return qs
    return qs.filter(pk__in=allowed) if allowed else qs.none()


def filter_enrollments_queryset(user, qs):
    allowed = accessible_group_ids(user)
    if allowed is None:
        return qs
    student = _resolve_student_user(user)
    if student and not _teacher_profile(user):
        return qs.filter(student=student)
    return qs.filter(group_id__in=allowed) if allowed else qs.none()


def filter_assignments_queryset(user, qs):
    if user.is_staff:
        return qs
    teacher = _teacher_profile(user)
    if not teacher:
        return qs.none()
    visible_ids = _visible_assignments(user, teacher).values_list("pk", flat=True)
    return qs.filter(pk__in=visible_ids)


def filter_grades_queryset(user, qs):
    if user.is_staff:
        return qs
    student = _resolve_student_user(user)
    teacher = _teacher_profile(user)
    if student and not teacher:
        return qs.filter(student=student)
    if teacher:
        visible_ids = _visible_assignments(user, teacher).values_list("pk", flat=True)
        return qs.filter(assignment_id__in=visible_ids)
    return qs.none()
