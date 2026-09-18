"""Исходящие сообщения Telegram Bot API (уведомления, не Login Widget)."""

from __future__ import annotations

import logging
import os

import requests

logger = logging.getLogger(__name__)


def telegram_bot_token() -> str:
    return os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()


def send_telegram_message(*, chat_id: int, text: str) -> bool:
    token = telegram_bot_token()
    if not token or not chat_id:
        return False
    try:
        res = requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": text, "disable_web_page_preview": True},
            timeout=15,
        )
        if not res.ok:
            logger.warning("Telegram sendMessage failed: %s %s", res.status_code, res.text[:200])
            return False
        return True
    except requests.RequestException as exc:
        logger.warning("Telegram sendMessage error: %s", exc)
        return False
