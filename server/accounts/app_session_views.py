"""API сессий ЛК, logout, passport, quick login."""

from __future__ import annotations

from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.app_auth_views import _full_auth_response_for_account
from accounts.app_sessions import (
    clear_session_cookies,
    cookie_kwargs,
    create_app_session,
    passport_payload,
    read_passport,
    resolve_session_from_request,
    session_ttl_days_for_kind,
    set_jwt_cookies,
    set_session_cookies,
    _sign_passport,
    PASSPORT_COOKIE,
)
from accounts.models import AppAccount, AppSession
from kbp_server.throttling import AuthAnonRateThrottle


def _account(request) -> AppAccount | None:
    return AppAccount.objects.filter(user=request.user).select_related("group", "student").first()


def _role_for(account: AppAccount) -> str:
    user = account.user
    if user.is_superuser or user.is_staff:
        return "admin"
    teacher = getattr(user, "teacher_profile", None)
    if teacher and teacher.is_active:
        return "teacher"
    return "student"


class AppSessionsListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        account = _account(request)
        if not account:
            return Response({"detail": "Профиль не найден"}, status=404)

        current = resolve_session_from_request(request)
        now = timezone.now()
        rows = []
        for s in AppSession.objects.filter(account=account, revoked_at__isnull=True, expires_at__gt=now):
            rows.append(
                {
                    "id": s.pk,
                    "device_kind": s.device_kind,
                    "trust_level": s.trust_level,
                    "user_agent": s.user_agent[:120],
                    "ip_address": s.ip_address,
                    "created_at": s.created_at.isoformat(),
                    "last_seen": s.last_seen.isoformat(),
                    "expires_at": s.expires_at.isoformat(),
                    "is_current": bool(current and current.pk == s.pk),
                    "is_most_trusted": s.device_kind == AppSession.DeviceKind.MOBILE,
                }
            )
        rows.sort(key=lambda r: (-r["trust_level"], r["last_seen"]), reverse=False)
        rows.sort(key=lambda r: -r["trust_level"])
        kind = current.device_kind if current else AppSession.DeviceKind.WEB
        return Response(
            {
                "sessions": rows,
                "session_ttl_days": session_ttl_days_for_kind(kind, account),
            }
        )


class AppSessionDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, pk: int):
        account = _account(request)
        if not account:
            return Response({"detail": "Профиль не найден"}, status=404)
        session = AppSession.objects.filter(pk=pk, account=account).first()
        if not session:
            return Response({"detail": "Сессия не найдена"}, status=404)
        session.revoked_at = timezone.now()
        session.save(update_fields=["revoked_at"])
        return Response({"ok": True})


class AppLogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        session = resolve_session_from_request(request)
        if session:
            session.revoked_at = timezone.now()
            session.save(update_fields=["revoked_at"])
        resp = Response({"ok": True})
        clear_session_cookies(resp)
        return resp


class AppPassportView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        data = read_passport(request)
        if not data:
            return Response({"detail": "Нет паспорта"}, status=401)
        return Response({"passport": data})


class AppCookieSessionView(APIView):
    """JWT из cookie minikbp_session — чтобы panel.mini-kbp.site поднял staff-сессию без localStorage с lk."""

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        session = resolve_session_from_request(request)
        if not session:
            return Response({"detail": "Forbidden"}, status=403)
        account = (
            AppAccount.objects.filter(pk=session.account_id)
            .select_related("user", "group", "student")
            .first()
        )
        if not account:
            return Response({"detail": "Forbidden"}, status=403)
        try:
            payload = _full_auth_response_for_account(account, request)
        except ValueError:
            return Response({"detail": "Forbidden"}, status=403)
        if payload.get("role") not in ("admin", "teacher"):
            return Response({"detail": "Forbidden"}, status=403)
        resp = Response(payload)
        ttl = session_ttl_days_for_kind(session.device_kind, account)
        set_jwt_cookies(
            resp,
            access=payload["access"],
            refresh=payload["refresh"],
            max_age=ttl * 86400,
        )
        return resp


class AppSessionTtlView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request):
        account = _account(request)
        if not account:
            return Response({"detail": "Профиль не найден"}, status=404)
        try:
            days = int(request.data.get("session_ttl_days"))
        except (TypeError, ValueError):
            return Response({"detail": "Укажите session_ttl_days"}, status=400)
        if days < 1 or days > 365:
            return Response({"detail": "TTL от 1 до 365 дней"}, status=400)
        account.session_ttl_days = days
        account.save(update_fields=["session_ttl_days"])
        return Response({"session_ttl_days": account.session_ttl_days})


class AppQuickLoginView(APIView):
    """Обмен quick_login_token (с мобилки) на JWT."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [AuthAnonRateThrottle]

    def post(self, request):
        token = (request.data.get("quick_login_token") or "").strip()
        if not token:
            return Response({"detail": "Нет токена"}, status=400)
        session = (
            AppSession.objects.filter(
                quick_login_token=token,
                revoked_at__isnull=True,
                expires_at__gt=timezone.now(),
            )
            .select_related("account", "account__user", "account__group", "account__student")
            .first()
        )
        if not session:
            return Response({"detail": "Токен недействителен"}, status=401)

        account = session.account
        payload = _full_auth_response_for_account(account, request)
        # refresh last_seen; optionally mint new session for this client
        new_session = create_app_session(account, request)
        role = payload.get("role") or _role_for(account)
        resp = Response({**payload, "session_id": new_session.pk, "quick_login_token": new_session.quick_login_token or token})
        set_session_cookies(resp, account, new_session, role)
        return resp


class AppIssueSessionView(APIView):
    """После JWT-логина клиент вызывает чтобы получить cookie + session_id."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        account = _account(request)
        if not account:
            return Response({"detail": "Профиль не найден"}, status=404)
        role = _role_for(account)

        from rest_framework_simplejwt.authentication import JWTAuthentication

        auth = JWTAuthentication()
        try:
            result = auth.authenticate(request)
        except Exception:
            result = None
        if result:
            _user, token = result
            sid = token.get("sid")
            if sid is not None:
                try:
                    sid_int = int(sid)
                except (TypeError, ValueError):
                    sid_int = None
                if sid_int is not None:
                    existing = (
                        AppSession.objects.filter(
                            pk=sid_int, account=account, revoked_at__isnull=True
                        )
                        .first()
                    )
                    if existing and existing.is_active:
                        body = {
                            "session_id": existing.pk,
                            "device_kind": existing.device_kind,
                            "trust_level": existing.trust_level,
                            "expires_at": existing.expires_at.isoformat(),
                            "quick_login_token": existing.quick_login_token or None,
                            "session_ttl_days": session_ttl_days_for_kind(existing.device_kind, account),
                            "reused": True,
                        }
                        resp = Response(body)
                        signed = read_passport(request)
                        if not signed or signed.get("session_id") != existing.pk:
                            ttl_days = session_ttl_days_for_kind(existing.device_kind, account)
                            resp.set_cookie(
                                PASSPORT_COOKIE,
                                _sign_passport(passport_payload(account, existing, role)),
                                **cookie_kwargs(max_age=ttl_days * 86400),
                            )
                        return resp

        existing = resolve_session_from_request(request)
        if existing and existing.account_id == account.pk and existing.is_active:
            session = existing
            body = {
                "session_id": session.pk,
                "device_kind": session.device_kind,
                "trust_level": session.trust_level,
                "expires_at": session.expires_at.isoformat(),
                "quick_login_token": session.quick_login_token or None,
                "session_ttl_days": session_ttl_days_for_kind(session.device_kind, account),
                "reused": True,
            }
            resp = Response(body)
            signed = read_passport(request)
            if not signed or signed.get("session_id") != session.pk:
                ttl_days = session_ttl_days_for_kind(session.device_kind, account)
                resp.set_cookie(
                    PASSPORT_COOKIE,
                    _sign_passport(passport_payload(account, session, role)),
                    **cookie_kwargs(max_age=ttl_days * 86400),
                )
            return resp
        session = create_app_session(account, request)
        body = {
            "session_id": session.pk,
            "device_kind": session.device_kind,
            "trust_level": session.trust_level,
            "expires_at": session.expires_at.isoformat(),
            "quick_login_token": session.quick_login_token or None,
            "session_ttl_days": session_ttl_days_for_kind(session.device_kind, account),
            "reused": False,
        }
        resp = Response(body)
        set_session_cookies(resp, account, session, role)
        return resp
