"""Проверка TOTP администратора для опасных операций."""

from __future__ import annotations

import pyotp
from rest_framework import status
from rest_framework.response import Response

from accounts.models import AppAccount


def require_admin_totp(request) -> Response | None:
    account = AppAccount.objects.filter(user=request.user).first()
    if not account or not account.two_fa_enabled or not account.two_fa_secret:
        return Response(
            {"detail": "Для удаления студента включите 2FA в профиле", "need_2fa": True},
            status=status.HTTP_403_FORBIDDEN,
        )
    code = str(request.data.get("totp_code") or request.query_params.get("totp_code") or "").strip()
    if not code:
        return Response(
            {"detail": "Введите код 2FA", "need_2fa": True},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not pyotp.TOTP(account.two_fa_secret).verify(code, valid_window=1):
        return Response({"detail": "Неверный код 2FA"}, status=status.HTTP_400_BAD_REQUEST)
    return None
