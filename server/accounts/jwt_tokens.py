"""JWT с разным сроком refresh для mobile (7 д) и web (30 д)."""

from __future__ import annotations

from datetime import timedelta

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.app_sessions import detect_device_kind
from accounts.models import AppSession

REFRESH_DAYS_MOBILE = 7
REFRESH_DAYS_WEB = 30
ACCESS_HOURS = 12


def refresh_lifetime_for_kind(kind: str) -> timedelta:
    days = REFRESH_DAYS_MOBILE if kind == AppSession.DeviceKind.MOBILE else REFRESH_DAYS_WEB
    return timedelta(days=days)


def refresh_lifetime_for_request(request) -> timedelta:
    return refresh_lifetime_for_kind(detect_device_kind(request))


def issue_token_pair(user: User, request=None, *, kind: str | None = None, session_id: int | None = None) -> dict[str, str]:
    if kind is None:
        kind = detect_device_kind(request) if request is not None else AppSession.DeviceKind.WEB
    refresh = RefreshToken.for_user(user)
    refresh.set_exp(from_time=timezone.now(), lifetime=refresh_lifetime_for_kind(kind))
    access = refresh.access_token
    access.set_exp(from_time=timezone.now(), lifetime=timedelta(hours=ACCESS_HOURS))
    if session_id is not None:
        refresh["sid"] = session_id
        access["sid"] = session_id
    return {"access": str(access), "refresh": str(refresh)}


class AppTokenRefreshView(APIView):
    """Обновление access (+ новый refresh) с учётом типа клиента."""

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        refresh_str = (request.data.get("refresh") or "").strip()
        if not refresh_str:
            return Response({"detail": "Нет refresh-токена"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            old = RefreshToken(refresh_str)
            user = User.objects.get(pk=old["user_id"])
        except (TokenError, User.DoesNotExist, KeyError):
            return Response(
                {"detail": "Данный токен недействителен для любого типа токена. Попробуйте ещё раз."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        sid = old.get("sid")
        if sid is not None:
            try:
                sid_int = int(sid)
            except (TypeError, ValueError):
                return Response({"detail": "Сессия недействительна"}, status=status.HTTP_401_UNAUTHORIZED)
            session = AppSession.objects.filter(pk=sid_int, revoked_at__isnull=True).first()
            if not session or not session.is_active or session.account.user_id != user.pk:
                return Response({"detail": "Сессия завершена. Войдите снова."}, status=status.HTTP_401_UNAUTHORIZED)

        lifetime = refresh_lifetime_for_request(request)
        refresh = RefreshToken.for_user(user)
        refresh.set_exp(from_time=timezone.now(), lifetime=lifetime)
        access = refresh.access_token
        access.set_exp(from_time=timezone.now(), lifetime=timedelta(hours=ACCESS_HOURS))
        if sid is not None:
            refresh["sid"] = sid
            access["sid"] = sid
        return Response({"access": str(access), "refresh": str(refresh)})
