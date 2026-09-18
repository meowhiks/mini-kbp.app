"""Проверка id_token и обмен authorization code Telegram OIDC."""

from __future__ import annotations

import base64
import os

import jwt
import requests
from jwt import PyJWKClient

JWKS_URL = "https://oauth.telegram.org/.well-known/jwks.json"
_jwk_client = PyJWKClient(JWKS_URL, cache_keys=True)


def verify_telegram_oidc_token(id_token: str, *, client_id: int) -> dict | None:
    try:
        signing_key = _jwk_client.get_signing_key_from_jwt(id_token)
        return jwt.decode(
            id_token,
            signing_key.key,
            algorithms=["RS256", "ES256", "EdDSA", "ES256K"],
            audience=str(client_id),
            issuer="https://oauth.telegram.org",
        )
    except Exception:
        return None


def _telegram_oidc_client_secret() -> str:
    return (os.environ.get("TELEGRAM_OIDC_CLIENT_SECRET") or "").strip()


def exchange_telegram_oidc_code(
    *,
    code: str,
    code_verifier: str,
    redirect_uri: str,
    client_id: int,
) -> str | None:
    secret = _telegram_oidc_client_secret()
    if not secret or not code or not code_verifier or not redirect_uri:
        return None

    credentials = base64.b64encode(f"{client_id}:{secret}".encode()).decode()
    try:
        resp = requests.post(
            "https://oauth.telegram.org/token",
            headers={"Authorization": f"Basic {credentials}"},
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
                "client_id": str(client_id),
                "code_verifier": code_verifier,
            },
            timeout=15,
        )
        if resp.status_code != 200:
            import logging

            logging.getLogger(__name__).warning(
                "telegram oidc token exchange failed status=%s body=%s redirect_uri=%s",
                resp.status_code,
                (resp.text or "")[:300],
                redirect_uri,
            )
            return None
        payload = resp.json()
        token = (payload.get("id_token") or "").strip()
        return token or None
    except Exception as exc:
        import logging

        logging.getLogger(__name__).warning("telegram oidc token exchange error: %s", exc)
        return None
