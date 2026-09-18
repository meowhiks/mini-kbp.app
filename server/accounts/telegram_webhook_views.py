"""Webhook Telegram Bot API — вход через /start TOKEN."""

from __future__ import annotations

import os
import re

from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import AppAccount
from accounts.app_auth_views import _auth_step_response, get_or_create_app_account
from accounts.telegram_bot_link import (
    complete_telegram_link_token,
    link_token_pending,
    peek_telegram_link_token,
)
from accounts.telegram_notify import send_telegram_message

_START_RE = re.compile(r"^/start(?:@\w+)?(?:\s+(\S+))?$", re.IGNORECASE)


class TelegramWebhookView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes: list = []

    def post(self, request):
        secret = (os.environ.get("TELEGRAM_WEBHOOK_SECRET") or "").strip()
        if not secret:
            return Response({"detail": "Webhook not configured"}, status=503)

        header = (request.headers.get("X-Telegram-Bot-Api-Secret-Token") or "").strip()
        if header != secret:
            return Response({"detail": "Forbidden"}, status=403)

        update = request.data if isinstance(request.data, dict) else {}
        message = update.get("message") or update.get("edited_message") or {}
        if not message:
            return Response({"ok": True})

        chat = message.get("chat") or {}
        chat_id = chat.get("id")
        if not chat_id:
            return Response({"ok": True})

        text = (message.get("text") or "").strip()
        from_user = message.get("from") or {}

        match = _START_RE.match(text)
        if not match:
            if text.startswith("/"):
                send_telegram_message(
                    chat_id=int(chat_id),
                    text="Откройте вход в приложении MiniKBP и нажмите «Войти через Telegram».",
                )
            return Response({"ok": True})

        token = (match.group(1) or "").strip()
        if not token:
            send_telegram_message(
                chat_id=int(chat_id),
                text="Откройте MiniKBP → «Войти через Telegram», чтобы получить код привязки.",
            )
            return Response({"ok": True})

        if not link_token_pending(token):
            send_telegram_message(
                chat_id=int(chat_id),
                text="Код устарел или уже использован. Запросите новый в приложении.",
            )
            return Response({"ok": True})

        try:
            telegram_id = int(from_user.get("id"))
        except (TypeError, ValueError):
            send_telegram_message(chat_id=int(chat_id), text="Не удалось определить Telegram ID.")
            return Response({"ok": True})

        first = (from_user.get("first_name") or "").strip()
        last = (from_user.get("last_name") or "").strip()
        display_name = " ".join(p for p in [first, last] if p).strip()
        username = (from_user.get("username") or "").strip()

        pending = peek_telegram_link_token(token) or {}
        bind_account_id = pending.get("account_id")
        if bind_account_id:
            taken = (
                AppAccount.objects.filter(telegram_id=telegram_id)
                .exclude(pk=bind_account_id)
                .exists()
            )
            if taken:
                complete_telegram_link_token(
                    token,
                    {
                        "linked": False,
                        "detail": "Этот Telegram уже привязан к другому аккаунту",
                    },
                )
                send_telegram_message(
                    chat_id=int(chat_id),
                    text="Этот Telegram уже привязан к другому аккаунту MiniKBP.",
                )
                return Response({"ok": True})
            account = AppAccount.objects.filter(pk=bind_account_id).first()
            if not account:
                send_telegram_message(chat_id=int(chat_id), text="Аккаунт не найден. Войдите снова.")
                return Response({"ok": True})
            account.telegram_id = telegram_id
            account.telegram_username = username
            account.save(update_fields=["telegram_id", "telegram_username"])
            if not complete_telegram_link_token(
                token,
                {
                    "linked": True,
                    "telegram_username": username,
                    "telegram_id": telegram_id,
                },
            ):
                send_telegram_message(
                    chat_id=int(chat_id),
                    text="Код устарел. Запросите новый в приложении.",
                )
                return Response({"ok": True})
            send_telegram_message(chat_id=int(chat_id), text="Telegram привязан к аккаунту MiniKBP.")
            return Response({"ok": True})

        account, _ = get_or_create_app_account(
            telegram_id=telegram_id,
            telegram_username=username,
            display_name=display_name or username or f"Telegram {telegram_id}",
        )
        payload = _auth_step_response(account)
        if not complete_telegram_link_token(token, payload):
            send_telegram_message(
                chat_id=int(chat_id),
                text="Код устарел. Запросите новый в приложении.",
            )
            return Response({"ok": True})

        send_telegram_message(chat_id=int(chat_id), text="Успешный вход.")
        return Response({"ok": True})
