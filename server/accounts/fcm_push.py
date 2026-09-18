"""Отправка push-уведомлений через Firebase Cloud Messaging."""

from __future__ import annotations

import json
import logging
import os
from typing import Iterable

logger = logging.getLogger(__name__)


def fcm_configured() -> bool:
    from django.conf import settings

    raw = getattr(settings, "FIREBASE_SERVICE_ACCOUNT_JSON", "") or os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON", "")
    return bool(str(raw).strip())


def _firebase_json() -> str:
    from django.conf import settings

    raw = getattr(settings, "FIREBASE_SERVICE_ACCOUNT_JSON", "") or os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON", "")
    return str(raw).strip()


def _ensure_firebase():
    import firebase_admin
    from firebase_admin import credentials

    if firebase_admin._apps:
        return
    raw = _firebase_json()
    if not raw:
        raise RuntimeError("FIREBASE_SERVICE_ACCOUNT_JSON не настроен")
    service_account = json.loads(raw)
    firebase_admin.initialize_app(credentials.Certificate(service_account))


def send_fcm_messages(tokens: Iterable[str], *, title: str, body: str, source: str = "admin") -> tuple[int, int]:
    """Возвращает (успешно, ошибок)."""
    unique = [t for t in dict.fromkeys(tokens) if t]
    if not unique:
        return 0, 0

    _ensure_firebase()
    from firebase_admin import messaging

    message = messaging.MulticastMessage(
        tokens=unique,
        notification=messaging.Notification(title=title, body=body),
        data={"title": title, "body": body, "source": source},
        android=messaging.AndroidConfig(priority="high"),
    )
    response = messaging.send_each_for_multicast(message)
    failed = response.failure_count
    success = response.success_count
    if failed:
        for idx, item in enumerate(response.responses):
            if item.exception:
                logger.warning("FCM send failed token[%s]: %s", idx, item.exception)
    return success, failed
