"""Одноразовые токены входа через Telegram-бот (/start TOKEN)."""

from __future__ import annotations

import secrets

from django.core.cache import cache

TELEGRAM_LINK_TTL = 300
TELEGRAM_LINK_DONE_TTL = 90
_CACHE_PREFIX = "tg_bot_link:"


def issue_telegram_link_token(*, account_id: int | None = None) -> str:
    token = secrets.token_urlsafe(12).replace("-", "").replace("_", "")[:16]
    cache.set(
        f"{_CACHE_PREFIX}{token}",
        {"status": "pending", "account_id": account_id},
        TELEGRAM_LINK_TTL,
    )
    return token


def peek_telegram_link_token(token: str) -> dict | None:
    raw = (token or "").strip()
    if not raw:
        return None
    entry = cache.get(f"{_CACHE_PREFIX}{raw}")
    return entry if isinstance(entry, dict) else None


def link_token_pending(token: str) -> bool:
    raw = (token or "").strip()
    if not raw:
        return False
    entry = cache.get(f"{_CACHE_PREFIX}{raw}")
    return isinstance(entry, dict) and entry.get("status") == "pending"


def complete_telegram_link_token(token: str, payload: dict) -> bool:
    raw = (token or "").strip()
    if not raw or not link_token_pending(raw):
        return False
    cache.set(
        f"{_CACHE_PREFIX}{raw}",
        {"status": "done", "payload": payload},
        TELEGRAM_LINK_DONE_TTL,
    )
    return True


def poll_telegram_link_token(token: str) -> dict | None:
    raw = (token or "").strip()
    if not raw:
        return None
    key = f"{_CACHE_PREFIX}{raw}"
    entry = cache.get(key)
    if not entry:
        return None
    if entry.get("status") == "done":
        cache.delete(key)
        return entry.get("payload") if isinstance(entry.get("payload"), dict) else None
    return {"status": "pending"}
