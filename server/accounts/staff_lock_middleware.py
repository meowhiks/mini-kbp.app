"""Middleware: 423 Locked для заблокированных staff-сессий."""

from __future__ import annotations

from django.http import JsonResponse
from django.utils import timezone

from accounts.models import StaffSecuritySettings, StaffSessionState


STAFF_PREFIXES = (
    "/v0/grades/",
    "/v0/journal-days/",
    "/v0/lateness/",
    "/v0/journal-sync/",
    "/v0/journal-presence/",
)

EXEMPT_SUFFIXES = (
    "/v0/staff-security/",
)


class StaffSessionLockMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path
        if any(path.startswith(p) for p in EXEMPT_SUFFIXES):
            return self.get_response(request)

        user = getattr(request, "user", None)
        if user and user.is_authenticated and (user.is_staff or hasattr(user, "teacher_profile")):
            if request.method not in ("GET", "HEAD", "OPTIONS") and any(
                path.startswith(p) for p in STAFF_PREFIXES
            ):
                settings_obj = StaffSecuritySettings.objects.filter(user=user).first()
                state = StaffSessionState.objects.filter(user=user).first()
                if settings_obj and state and settings_obj.lock_enabled:
                    if settings_obj.idle_lock_minutes:
                        idle_sec = settings_obj.idle_lock_minutes * 60
                        if (timezone.now() - state.last_activity).total_seconds() >= idle_sec:
                            if not state.locked:
                                state.locked = True
                                state.save(update_fields=["locked"])
                    if state.locked:
                        return JsonResponse(
                            {"detail": "Сеанс заблокирован", "code": "session_locked"},
                            status=423,
                        )
                    state.last_activity = timezone.now()
                    state.save(update_fields=["last_activity"])

        return self.get_response(request)
