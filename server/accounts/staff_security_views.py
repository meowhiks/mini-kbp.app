"""Staff session lock: PIN, idle timer, unlock."""

from __future__ import annotations

import hashlib
import secrets
import time

from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import StaffSecuritySettings, StaffSessionState


def _pin_hash(pin: str, user_id: int) -> str:
    return hashlib.sha256(f"{user_id}:{pin}".encode()).hexdigest()


def _get_settings(user: User) -> StaffSecuritySettings:
    obj, _ = StaffSecuritySettings.objects.get_or_create(user=user)
    return obj


def _get_state(user: User) -> StaffSessionState:
    obj, _ = StaffSessionState.objects.get_or_create(user=user)
    return obj


def _is_staff_user(user: User) -> bool:
    return user.is_staff or hasattr(user, "teacher_profile")


class StaffSecurityStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not _is_staff_user(request.user):
            return Response({"detail": "Только staff"}, status=status.HTTP_403_FORBIDDEN)
        settings_obj = _get_settings(request.user)
        state = _get_state(request.user)
        if settings_obj.lock_enabled and settings_obj.idle_lock_minutes:
            idle_sec = settings_obj.idle_lock_minutes * 60
            if (timezone.now() - state.last_activity).total_seconds() >= idle_sec:
                if not state.locked:
                    state.locked = True
                    state.save(update_fields=["locked"])
        return Response(
            {
                "locked": state.locked,
                "lock_enabled": settings_obj.lock_enabled,
                "idle_lock_minutes": settings_obj.idle_lock_minutes,
                "has_pin": bool(settings_obj.pin_hash),
                "pin_updated_at": settings_obj.pin_updated_at.isoformat() if settings_obj.pin_updated_at else None,
                "has_push": bool(state.unlock_push_token),
            }
        )


class StaffSecuritySettingsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not _is_staff_user(request.user):
            return Response({"detail": "Только staff"}, status=status.HTTP_403_FORBIDDEN)
        s = _get_settings(request.user)
        return Response(
            {
                "lock_enabled": s.lock_enabled,
                "idle_lock_minutes": s.idle_lock_minutes,
                "has_pin": bool(s.pin_hash),
                "pin_updated_at": s.pin_updated_at.isoformat() if s.pin_updated_at else None,
            }
        )

    def patch(self, request):
        if not _is_staff_user(request.user):
            return Response({"detail": "Только staff"}, status=status.HTTP_403_FORBIDDEN)
        s = _get_settings(request.user)
        if "lock_enabled" in request.data:
            s.lock_enabled = bool(request.data["lock_enabled"])
        if "idle_lock_minutes" in request.data:
            try:
                s.idle_lock_minutes = max(1, min(120, int(request.data["idle_lock_minutes"])))
            except (TypeError, ValueError):
                pass
        if "pin" in request.data:
            pin = str(request.data["pin"] or "").strip()
            if pin:
                if not pin.isdigit() or len(pin) < 4:
                    return Response({"detail": "PIN: 4–8 цифр"}, status=status.HTTP_400_BAD_REQUEST)
                s.pin_hash = _pin_hash(pin, request.user.pk)
                s.pin_updated_at = timezone.now()
            else:
                s.pin_hash = ""
        s.save()
        return Response({"ok": True})


class StaffSecurityUnlockPinView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not _is_staff_user(request.user):
            return Response({"detail": "Только staff"}, status=status.HTTP_403_FORBIDDEN)
        pin = str(request.data.get("pin") or "").strip()
        settings_obj = _get_settings(request.user)
        if not settings_obj.pin_hash:
            return Response({"detail": "PIN не задан"}, status=status.HTTP_400_BAD_REQUEST)
        if _pin_hash(pin, request.user.pk) != settings_obj.pin_hash:
            return Response({"detail": "Неверный PIN"}, status=status.HTTP_403_FORBIDDEN)
        state = _get_state(request.user)
        state.locked = False
        state.last_activity = timezone.now()
        state.save(update_fields=["locked", "last_activity"])
        return Response({"ok": True})


class StaffSecurityUnlockPasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not _is_staff_user(request.user):
            return Response({"detail": "Только staff"}, status=status.HTTP_403_FORBIDDEN)
        password = str(request.data.get("password") or "")
        user = authenticate(request, username=request.user.username, password=password)
        if user is None:
            return Response({"detail": "Неверный пароль"}, status=status.HTTP_403_FORBIDDEN)
        state = _get_state(request.user)
        state.locked = False
        state.last_activity = timezone.now()
        state.save(update_fields=["locked", "last_activity"])
        return Response({"ok": True})


class StaffSecurityUnlockPushView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not _is_staff_user(request.user):
            return Response({"detail": "Только staff"}, status=status.HTTP_403_FORBIDDEN)
        state = _get_state(request.user)
        state.unlock_push_token = secrets.token_urlsafe(16)
        state.save(update_fields=["unlock_push_token"])
        return Response({"ok": True, "token": state.unlock_push_token})


class StaffSecurityLockView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not _is_staff_user(request.user):
            return Response({"detail": "Только staff"}, status=status.HTTP_403_FORBIDDEN)
        state = _get_state(request.user)
        state.locked = True
        state.save(update_fields=["locked"])
        return Response({"ok": True})


class StaffSecurityActivityView(APIView):
    """Touch last_activity (client heartbeat)."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not _is_staff_user(request.user):
            return Response({"detail": "Только staff"}, status=status.HTTP_403_FORBIDDEN)
        state = _get_state(request.user)
        state.last_activity = timezone.now()
        state.save(update_fields=["last_activity"])
        return Response({"ok": True})
