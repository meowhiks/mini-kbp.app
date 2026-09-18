"""Polling-вход через сайт (Chrome): приложение ждёт, пока браузер завершит OAuth."""

from __future__ import annotations

import secrets

from django.core.cache import cache

MOBILE_WEB_LINK_TTL = 300
MOBILE_WEB_LINK_DONE_TTL = 120
_CACHE_PREFIX = "mobile_web_link:"


def issue_mobile_web_link_token(kind: str) -> str:
    token = secrets.token_urlsafe(12).replace("-", "").replace("_", "")[:16]
    cache.set(
        f"{_CACHE_PREFIX}{token}",
        {"status": "pending", "kind": kind},
        MOBILE_WEB_LINK_TTL,
    )
    return token


def link_token_pending(token: str) -> bool:
    raw = (token or "").strip()
    if not raw:
        return False
    entry = cache.get(f"{_CACHE_PREFIX}{raw}")
    return isinstance(entry, dict) and entry.get("status") == "pending"


def complete_mobile_web_link_token(token: str, payload: dict) -> bool:
    raw = (token or "").strip()
    if not raw or not link_token_pending(raw):
        return False
    entry = cache.get(f"{_CACHE_PREFIX}{raw}") or {}
    cache.set(
        f"{_CACHE_PREFIX}{raw}",
        {"status": "done", "kind": entry.get("kind"), "payload": payload},
        MOBILE_WEB_LINK_DONE_TTL,
    )
    return True


def poll_mobile_web_link_token(token: str) -> dict | None:
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
