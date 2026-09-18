"""Проверка credential JWT от Google Identity Services."""

from __future__ import annotations

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token


def verify_google_credential(token: str, *, client_id: str) -> dict | None:
    if not token or not client_id:
        return None
    try:
        return id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            client_id,
            clock_skew_in_seconds=60,
        )
    except Exception as exc:
        import logging

        logging.getLogger(__name__).warning("google credential verify failed: %s", exc)
        return None
