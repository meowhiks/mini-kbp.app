"""Сессии ЛК и паспорт-cookie."""

from __future__ import annotations

import hashlib
import os
import secrets
from datetime import timedelta

from django.conf import settings
from django.core import signing
from django.core.signing import BadSignature, SignatureExpired
from django.http import HttpRequest, HttpResponse
from django.utils import timezone

from accounts.models import AppAccount, AppSession

PASSPORT_COOKIE = "minikbp_passport"
SESSION_COOKIE = "minikbp_session"
ACCESS_COOKIE = "minikbp_access"
REFRESH_COOKIE = "minikbp_refresh"
PASSPORT_SALT = "minikbp-passport-v1"


def cookie_domain() -> str | None:
    """Общий домен для lk / panel / api (например .mini-kbp.site)."""
    raw = (getattr(settings, "APP_COOKIE_DOMAIN", None) or "").strip()
    return raw or None


def cookie_kwargs(*, max_age: int) -> dict:
    """Параметры Set-Cookie: Domain=.mini-kbp.site — lk, panel и apex видят одну сессию."""
    proxy_ssl = str(os.environ.get("TRUST_PROXY_SSL", "")).lower() in ("1", "true", "yes")
    if getattr(settings, "SECURE_PROXY_SSL_HEADER", None):
        proxy_ssl = True
    opts: dict = {
        "max_age": max_age,
        "httponly": True,
        "samesite": "Lax",
        "secure": (not settings.DEBUG) or proxy_ssl,
        "path": "/",
    }
    domain = cookie_domain()
    if domain:
        opts["domain"] = domain
    return opts


def delete_cookie_kwargs() -> dict:
    opts: dict = {"path": "/"}
    domain = cookie_domain()
    if domain:
        opts["domain"] = domain
    return opts
TRUST_MOBILE = 100
TRUST_DESKTOP = 40
TRUST_WEB = 20


def _sign_passport(payload: dict) -> str:
    return signing.dumps(payload, salt=PASSPORT_SALT)


def _unsign_passport(raw: str) -> dict:
    return signing.loads(raw, salt=PASSPORT_SALT, max_age=365 * 86400)


def detect_device_kind(request: HttpRequest) -> str:
    ua = (request.META.get("HTTP_USER_AGENT") or "").lower()
    client = (request.headers.get("X-Client-Kind") or "").lower()
    if not client:
        try:
            data = getattr(request, "data", None)
            if isinstance(data, dict):
                client = str(data.get("device_kind") or "").lower()
        except Exception:
            pass
    if client in ("mobile", "web", "desktop"):
        return client
    if "minikbp" in ua or "capacitor" in ua or "android" in ua or "iphone" in ua:
        return AppSession.DeviceKind.MOBILE
    return AppSession.DeviceKind.WEB


def trust_for_kind(kind: str) -> int:
    if kind == AppSession.DeviceKind.MOBILE:
        return TRUST_MOBILE
    if kind == AppSession.DeviceKind.DESKTOP:
        return TRUST_DESKTOP
    return TRUST_WEB


def client_ip(request: HttpRequest) -> str | None:
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    return (request.META.get("REMOTE_ADDR") or None)


MOBILE_SESSION_DAYS = 7
WEB_SESSION_DAYS = 30


def session_ttl_days_for_kind(kind: str, account: AppAccount) -> int:
    if kind == AppSession.DeviceKind.MOBILE:
        return MOBILE_SESSION_DAYS
    return max(1, min(365, int(account.session_ttl_days or WEB_SESSION_DAYS)))


def create_app_session(account: AppAccount, request: HttpRequest) -> AppSession:
    kind = detect_device_kind(request)
    ttl = session_ttl_days_for_kind(kind, account)
    raw_key = secrets.token_urlsafe(32)
    session = AppSession.objects.create(
        account=account,
        session_key=hashlib.sha256(raw_key.encode()).hexdigest(),
        device_kind=kind,
        user_agent=(request.META.get("HTTP_USER_AGENT") or "")[:512],
        ip_address=client_ip(request),
        trust_level=trust_for_kind(kind),
        expires_at=timezone.now() + timedelta(days=ttl),
        quick_login_token=secrets.token_urlsafe(24) if kind == AppSession.DeviceKind.MOBILE else "",
    )
    # store raw key on instance for cookie setters (not persisted as plain)
    session._raw_key = raw_key  # type: ignore[attr-defined]
    return session


PASSPORT_AVATAR_MAX_LEN = 256


def _passport_avatar_url(raw: str) -> str:
    url = (raw or "").strip()
    if not url or url.startswith("data:"):
        return ""
    if len(url) > PASSPORT_AVATAR_MAX_LEN:
        return ""
    return url


def passport_payload(account: AppAccount, session: AppSession, role: str) -> dict:
    group = account.group
    return {
        "account_id": account.pk,
        "display_name": account.display_name or "",
        "avatar_url": _passport_avatar_url(account.avatar_url or ""),
        "email": account.email or "",
        "telegram_id": account.telegram_id,
        "group_id": str(group.id) if group else None,
        "student_id": account.student_id,
        "role": role,
        "session_id": session.pk,
        "device_kind": session.device_kind,
    }


def set_jwt_cookies(response: HttpResponse, *, access: str, refresh: str, max_age: int) -> HttpResponse:
    opts = cookie_kwargs(max_age=max_age)
    response.set_cookie(ACCESS_COOKIE, access, **opts)
    response.set_cookie(REFRESH_COOKIE, refresh, **opts)
    return response


def set_session_cookies(
    response: HttpResponse,
    account: AppAccount,
    session: AppSession,
    role: str,
    *,
    access: str | None = None,
    refresh: str | None = None,
) -> HttpResponse:
    raw_key = getattr(session, "_raw_key", None)
    ttl = session_ttl_days_for_kind(session.device_kind, account)
    max_age = ttl * 86400
    opts = cookie_kwargs(max_age=max_age)
    if raw_key:
        response.set_cookie(SESSION_COOKIE, raw_key, **opts)
    signed = _sign_passport(passport_payload(account, session, role))
    response.set_cookie(PASSPORT_COOKIE, signed, **opts)
    if access and refresh:
        set_jwt_cookies(response, access=access, refresh=refresh, max_age=max_age)
    else:
        from accounts.jwt_tokens import issue_token_pair

        tokens = issue_token_pair(account.user, kind=session.device_kind, session_id=session.pk)
        set_jwt_cookies(response, access=tokens["access"], refresh=tokens["refresh"], max_age=max_age)
    return response


def clear_session_cookies(response: HttpResponse) -> HttpResponse:
    del_opts = delete_cookie_kwargs()
    response.delete_cookie(SESSION_COOKIE, **del_opts)
    response.delete_cookie(PASSPORT_COOKIE, **del_opts)
    response.delete_cookie(ACCESS_COOKIE, **del_opts)
    response.delete_cookie(REFRESH_COOKIE, **del_opts)
    return response


def read_passport(request: HttpRequest) -> dict | None:
    raw = request.COOKIES.get(PASSPORT_COOKIE)
    if not raw:
        return None
    try:
        return _unsign_passport(raw)
    except (BadSignature, SignatureExpired, ValueError, TypeError):
        return None


def resolve_session_from_request(request: HttpRequest) -> AppSession | None:
    raw = request.COOKIES.get(SESSION_COOKIE)
    if not raw:
        return None
    digest = hashlib.sha256(raw.encode()).hexdigest()
    session = (
        AppSession.objects.filter(session_key=digest, revoked_at__isnull=True)
        .select_related("account")
        .first()
    )
    if not session or not session.is_active:
        return None
    session.last_seen = timezone.now()
    session.save(update_fields=["last_seen"])
    return session
