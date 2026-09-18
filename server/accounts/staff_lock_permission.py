"""DRF permission: блокировка staff-сессии (423)."""

from __future__ import annotations

from django.utils import timezone
from rest_framework import permissions
from rest_framework.exceptions import APIException

from accounts.models import StaffSecuritySettings, StaffSessionState


class SessionLocked(APIException):
    status_code = 423
    default_detail = "Сеанс заблокирован"
    default_code = "session_locked"


def _touch_staff_activity(user) -> StaffSessionState:
    state, _ = StaffSessionState.objects.get_or_create(user=user)
    state.last_activity = timezone.now()
    state.save(update_fields=["last_activity"])
    return state


def staff_session_is_locked(user) -> bool:
    if not user or not user.is_authenticated:
        return False
    teacher = getattr(user, "teacher_profile", None)
    if not (user.is_staff or teacher):
        return False
    settings_obj = StaffSecuritySettings.objects.filter(user=user, lock_enabled=True).first()
    if not settings_obj:
        return False
    state, _ = StaffSessionState.objects.get_or_create(user=user)
    if settings_obj.idle_lock_minutes:
        idle_sec = settings_obj.idle_lock_minutes * 60
        if (timezone.now() - state.last_activity).total_seconds() >= idle_sec:
            if not state.locked:
                state.locked = True
                state.save(update_fields=["locked"])
    return bool(state.locked)


class StaffSessionUnlocked(permissions.BasePermission):
    """Запрещает мутации журнала при заблокированном staff-сеансе."""

    def has_permission(self, request, view):
        user = request.user
        if request.method in permissions.SAFE_METHODS:
            if user and user.is_authenticated:
                teacher = getattr(user, "teacher_profile", None)
                if user.is_staff or teacher:
                    _touch_staff_activity(user)
            return True
        if staff_session_is_locked(user):
            raise SessionLocked()
        if user and user.is_authenticated:
            _touch_staff_activity(user)
        return True
