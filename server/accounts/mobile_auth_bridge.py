"""Одноразовые коды для возврата из Custom Tab / deep link в Capacitor."""

from __future__ import annotations

import secrets

from django.core.cache import cache

MOBILE_AUTH_CODE_TTL = 60
_CACHE_PREFIX = "app_mobile_auth_code:"


def issue_mobile_auth_code(payload: dict) -> str:
    code = secrets.token_urlsafe(32)
    cache.set(f"{_CACHE_PREFIX}{code}", payload, MOBILE_AUTH_CODE_TTL)
    return code


def consume_mobile_auth_code(code: str) -> dict | None:
    raw = (code or "").strip()
    if not raw:
        return None
    key = f"{_CACHE_PREFIX}{raw}"
    payload = cache.get(key)
    if payload is None:
        return None
    cache.delete(key)
    return payload
