"""Django email backend через Resend HTTP API."""

from __future__ import annotations

import logging
from typing import Any

import requests
from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend
from django.core.mail.message import EmailMessage

logger = logging.getLogger(__name__)

RESEND_URL = "https://api.resend.com/emails"


class ResendEmailBackend(BaseEmailBackend):
    def __init__(self, *args: Any, fail_silently: bool = False, **kwargs: Any) -> None:
        super().__init__(*args, fail_silently=fail_silently, **kwargs)
        self.api_key = getattr(settings, "RESEND_API_KEY", "") or ""

    def send_messages(self, email_messages: list[EmailMessage]) -> int:
        if not email_messages:
            return 0
        if not self.api_key:
            if not self.fail_silently:
                raise RuntimeError("RESEND_API_KEY не задан")
            logger.error("RESEND_API_KEY не задан — письма не отправлены")
            return 0

        sent = 0
        for message in email_messages:
            try:
                self._send_one(message)
                sent += 1
            except Exception:
                logger.exception("Resend: не удалось отправить письмо")
                if not self.fail_silently:
                    raise
        return sent

    def _send_one(self, message: EmailMessage) -> None:
        html = None
        text = message.body or ""
        if getattr(message, "alternatives", None):
            for content, mimetype in message.alternatives:
                if mimetype == "text/html":
                    html = content
                    break
        if html is None and message.content_subtype == "html":
            html = message.body
            text = ""

        payload: dict[str, Any] = {
            "from": message.from_email or getattr(settings, "DEFAULT_FROM_EMAIL", ""),
            "to": list(message.to),
            "subject": message.subject or "",
        }
        if message.cc:
            payload["cc"] = list(message.cc)
        if message.bcc:
            payload["bcc"] = list(message.bcc)
        if message.reply_to:
            payload["reply_to"] = list(message.reply_to)
        if html:
            payload["html"] = html
            if text:
                payload["text"] = text
        else:
            payload["text"] = text or " "

        resp = requests.post(
            RESEND_URL,
            json=payload,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            timeout=20,
        )
        if resp.status_code >= 400:
            detail = resp.text[:500]
            raise RuntimeError(f"Resend HTTP {resp.status_code}: {detail}")
