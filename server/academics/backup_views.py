"""API бэкапов журналов — только просмотр и восстановление с подтверждением."""

from __future__ import annotations

import secrets

import pyotp
from django.core.cache import cache
from django.core.mail import send_mail
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import AppAccount
from accounts.telegram_notify import send_telegram_message
from accounts.permissions import IsStaffUser
from kbp_server.throttling import RestoreUserRateThrottle

from .journal_backup import create_daily_backup, decompress_payload, restore_journal_from_payload
from .models import JournalBackup


def _serialize_backup(b: JournalBackup) -> dict:
    ratio = 0
    if b.uncompressed_bytes:
        ratio = round((1 - b.compressed_bytes / b.uncompressed_bytes) * 100, 1)
    return {
        "id": b.id,
        "backup_date": b.backup_date.isoformat(),
        "created_at": b.created_at.isoformat(),
        "uncompressed_bytes": b.uncompressed_bytes,
        "compressed_bytes": b.compressed_bytes,
        "compression_ratio_pct": ratio,
        "stats": b.stats or {},
    }


def _staff_app_account(user) -> AppAccount | None:
    return AppAccount.objects.filter(user=user).first()


class JournalBackupListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsStaffUser]

    def get(self, request):
        items = [_serialize_backup(b) for b in JournalBackup.objects.all()[:400]]
        return Response(items)

    def post(self, request):
        """Ручной бэкап (для теста)."""
        force = bool(request.data.get("force"))
        obj = create_daily_backup(force=force)
        if not obj:
            return Response({"detail": "Бэкап на сегодня уже есть"}, status=409)
        return Response(_serialize_backup(obj), status=201)


class JournalBackupRestoreRequestView(APIView):
    """POST — отправить коды на почту и Telegram, вернуть pending_token."""

    permission_classes = [permissions.IsAuthenticated, IsStaffUser]
    throttle_classes = [RestoreUserRateThrottle]

    def post(self, request, pk: int):
        try:
            backup = JournalBackup.objects.get(pk=pk)
        except JournalBackup.DoesNotExist:
            return Response({"detail": "Бэкап не найден"}, status=404)

        account = _staff_app_account(request.user)
        if not account or not account.email:
            return Response({"detail": "Привяжите email в личном кабинете"}, status=400)
        if not account.two_fa_enabled or not account.two_fa_secret:
            return Response({"detail": "Включите 2FA в личном кабинете"}, status=400)

        email_code = f"{secrets.randbelow(900000) + 100000:06d}"
        pending_token = secrets.token_urlsafe(32)
        cache.set(
            f"journal_restore:{pending_token}",
            {
                "backup_id": backup.id,
                "user_id": request.user.id,
                "email_code": email_code,
            },
            900,
        )

        send_mail(
            subject="Подтверждение восстановления журнала MiniKBP",
            message=(
                f"Код для восстановления журнала от {backup.backup_date}:\n\n{email_code}\n\n"
                "Код действует 15 минут. Также подтвердите в Telegram и введите 2FA в панели."
            ),
            from_email=None,
            recipient_list=[account.email],
            fail_silently=False,
        )

        tg_ok = False
        if account.telegram_id:
            tg_ok = send_telegram_message(
                chat_id=int(account.telegram_id),
                text=(
                    f"MiniKBP: запрос восстановления журнала от {backup.backup_date}.\n"
                    f"Код из письма: {email_code}\n"
                    "Подтвердите также 2FA в админ-панели."
                ),
            )

        return Response(
            {
                "pending_token": pending_token,
                "email": account.email,
                "telegram_sent": tg_ok,
                "backup_date": backup.backup_date.isoformat(),
            }
        )


class JournalBackupRestoreConfirmView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsStaffUser]
    throttle_classes = [RestoreUserRateThrottle]

    def post(self, request, pk: int):
        pending_token = (request.data.get("pending_token") or "").strip()
        email_code = (request.data.get("email_code") or "").strip()
        totp_code = (request.data.get("totp_code") or "").strip()

        if not pending_token or not email_code or not totp_code:
            return Response({"detail": "pending_token, email_code и totp_code обязательны"}, status=400)

        fail_key = f"journal_restore_fail:{request.user.id}:{pending_token}"
        fail_count = cache.get(fail_key, 0)
        if fail_count >= 5:
            return Response({"detail": "Слишком много неудачных попыток"}, status=429)

        cached = cache.get(f"journal_restore:{pending_token}")
        if not cached or cached.get("user_id") != request.user.id or cached.get("backup_id") != pk:
            return Response({"detail": "Запрос устарел или недействителен"}, status=400)
        if cached.get("email_code") != email_code:
            cache.set(fail_key, fail_count + 1, 900)
            return Response({"detail": "Неверный код из письма"}, status=403)

        account = _staff_app_account(request.user)
        if not account or not account.two_fa_enabled:
            return Response({"detail": "2FA не включена"}, status=400)
        totp = pyotp.TOTP(account.two_fa_secret)
        if not totp.verify(totp_code, valid_window=1):
            cache.set(fail_key, fail_count + 1, 900)
            return Response({"detail": "Неверный код 2FA"}, status=403)

        try:
            backup = JournalBackup.objects.get(pk=pk)
        except JournalBackup.DoesNotExist:
            return Response({"detail": "Бэкап не найден"}, status=404)

        payload = decompress_payload(bytes(backup.payload_gz))
        restored = restore_journal_from_payload(payload)
        cache.delete(f"journal_restore:{pending_token}")

        return Response(
            {
                "ok": True,
                "backup_date": backup.backup_date.isoformat(),
                "restored": restored,
            }
        )
