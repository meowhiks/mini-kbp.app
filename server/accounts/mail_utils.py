"""Когда реально отправлять письма (не только console backend)."""

from __future__ import annotations

import os

from django.conf import settings


def outbound_email_enabled() -> bool:
    if getattr(settings, "RESEND_API_KEY", "") or os.environ.get("RESEND_API_KEY", "").strip():
        return True
    if os.environ.get("APP_EMAIL_ENABLED", "").lower() in ("1", "true", "yes"):
        return True
    if getattr(settings, "APP_EMAIL_ENABLED", False):
        return True
    backend = getattr(settings, "EMAIL_BACKEND", "")
    if "console" in backend or "dummy" in backend:
        return False
    if "resend" in backend:
        return True
    return bool(getattr(settings, "EMAIL_HOST", "") or os.environ.get("EMAIL_HOST", "").strip())
