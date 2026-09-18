"""Вход в /app: почта, Telegram, код куратора, 2FA."""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets

import pyotp
from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner
from django.db import transaction
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from kbp_server.throttling import AuthAnonRateThrottle

PANEL_SITE_HOST = "panel.mini-kbp.site"


def request_is_panel_site(request) -> bool:
    origin = request.headers.get("Origin") or ""
    referer = request.headers.get("Referer") or ""
    return PANEL_SITE_HOST in f"{origin} {referer}".lower()

from accounts.jwt_tokens import issue_token_pair

from accounts.mobile_auth_bridge import consume_mobile_auth_code, issue_mobile_auth_code
from accounts.mobile_web_link import (
    complete_mobile_web_link_token,
    issue_mobile_web_link_token,
    poll_mobile_web_link_token,
)
from accounts.telegram_bot_link import issue_telegram_link_token, poll_telegram_link_token
from accounts.google_oidc import verify_google_credential
from accounts.telegram_oidc import exchange_telegram_oidc_code, verify_telegram_oidc_token
from accounts.app_email import build_registration_magic_link, send_registration_email, send_password_reset_email
from accounts.mail_utils import outbound_email_enabled
from accounts.models import AppAccount, Student, Teacher
from accounts.student_link import ensure_student_for_account
from academics.models import CuratorInviteCode, Enrollment, Group

User = get_user_model()

PENDING_CLAIM = "app_pending"
STEP_CLAIM = "app_step"
STEP_VERIFY = "verify"
STEP_2FA = "2fa"
REG_EMAIL_TTL = 86400
_signer = TimestampSigner(salt="app-reg-email")
TELEGRAM_AUTH_KEYS = frozenset({"id", "first_name", "last_name", "username", "photo_url", "auth_date"})


def _telegram_bot_token() -> str:
    return os.environ.get("TELEGRAM_BOT_TOKEN", "")


def _telegram_bot_client_id() -> int | None:
    token = _telegram_bot_token()
    if not token or ":" not in token:
        return None
    try:
        return int(token.split(":", 1)[0])
    except ValueError:
        return None


def _google_oauth_client_id() -> str | None:
    value = (
        os.environ.get("GOOGLE_OAUTH_CLIENT_ID")
        or os.environ.get("NEXT_PUBLIC_GOOGLE_CLIENT_ID")
        or ""
    ).strip()
    return value or None


def verify_telegram_login(data: dict) -> bool:
    """Проверка подписи Telegram Login Widget."""
    bot_token = _telegram_bot_token()
    if not bot_token:
        return False
    check_hash = data.get("hash")
    if not check_hash:
        return False
    payload = {
        k: str(v)
        for k, v in data.items()
        if k in TELEGRAM_AUTH_KEYS and v is not None and str(v) != ""
    }
    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(payload.items()))
    secret_key = hashlib.sha256(bot_token.encode()).digest()
    computed = hmac.new(
        secret_key, data_check_string.encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(computed, str(check_hash))


def _registration_expired(account: AppAccount) -> bool:
    if not account.email or _email_is_verified(account):
        return False
    age = timezone.now() - account.created_at
    return age.total_seconds() > REG_EMAIL_TTL


def _purge_unverified_account(account: AppAccount) -> None:
    user = account.user
    cache.delete(_registration_cache_key(account.pk))
    account.delete()
    user.delete()


def make_pending_token(user: User, step: str = "verify") -> str:
    refresh = RefreshToken.for_user(user)
    access = refresh.access_token
    access[PENDING_CLAIM] = True
    access[STEP_CLAIM] = step
    return str(access)


def parse_pending_token(raw: str) -> AccessToken | None:
    try:
        token = AccessToken(raw)
    except Exception:
        return None
    if not token.get(PENDING_CLAIM):
        return None
    return token


def make_full_tokens(user: User, request=None) -> dict:
    from accounts.jwt_auth import create_session_tokens

    return create_session_tokens(user, request)


def get_or_create_app_account(
    *,
    email: str | None = None,
    password: str | None = None,
    telegram_id: int | None = None,
    telegram_username: str = "",
    display_name: str = "",
) -> tuple[AppAccount, bool]:
    account = None
    if email:
        account = AppAccount.objects.filter(email__iexact=email).select_related("user").first()
    elif telegram_id:
        account = AppAccount.objects.filter(telegram_id=telegram_id).select_related("user").first()

    if account:
        if password:
            account.user.set_password(password)
            account.user.save(update_fields=["password"])
        if display_name and not account.display_name:
            account.display_name = display_name
            account.save(update_fields=["display_name"])
        return account, False

    base_username = email.split("@")[0] if email else f"tg{telegram_id}"
    username = base_username
    n = 0
    while User.objects.filter(username=username).exists():
        n += 1
        username = f"{base_username}_{n}"

    user = User.objects.create_user(
        username=username,
        email=email or "",
        password=password or secrets.token_urlsafe(24),
    )
    account = AppAccount.objects.create(
        user=user,
        email=email,
        telegram_id=telegram_id,
        telegram_username=telegram_username or "",
        display_name=display_name or email or telegram_username or f"Пользователь {telegram_id}",
    )
    return account, True


def get_or_create_google_account(
    *,
    google_sub: str,
    email: str,
    display_name: str = "",
    avatar_url: str = "",
) -> tuple[AppAccount, bool]:
    account = AppAccount.objects.filter(google_sub=google_sub).select_related("user").first()
    if not account and email:
        account = AppAccount.objects.filter(email__iexact=email).select_related("user").first()

    now = timezone.now()
    if account:
        updates: list[str] = []
        if not account.google_sub:
            account.google_sub = google_sub
            updates.append("google_sub")
        if email and not account.email:
            account.email = email
            updates.append("email")
        if not account.email_verified_at:
            account.email_verified_at = now
            updates.append("email_verified_at")
        if display_name and not account.display_name:
            account.display_name = display_name
            updates.append("display_name")
        if avatar_url and not account.avatar_url:
            account.avatar_url = avatar_url
            updates.append("avatar_url")
        if updates:
            account.save(update_fields=updates)
        if email and account.user.email != email:
            account.user.email = email
            account.user.save(update_fields=["email"])
        return account, False

    base_username = email.split("@")[0] if email else f"google_{google_sub[:8]}"
    username = base_username
    n = 0
    while User.objects.filter(username=username).exists():
        n += 1
        username = f"{base_username}_{n}"

    user = User.objects.create_user(
        username=username,
        email=email,
        password=secrets.token_urlsafe(24),
    )
    account = AppAccount.objects.create(
        user=user,
        email=email,
        google_sub=google_sub,
        display_name=display_name or email.split("@")[0],
        avatar_url=avatar_url,
        email_verified_at=now,
    )
    return account, True


def _account_has_assigned_role(account: AppAccount) -> bool:
    """Роль уже назначена — повторный код на входе не нужен."""
    user = account.user
    if user.is_superuser or user.is_staff:
        return True
    teacher = getattr(user, "teacher_profile", None)
    if teacher and teacher.is_active:
        return True
    if account.student_id:
        return True
    student = getattr(user, "student_profile", None)
    if student and student.is_active:
        return True
    return bool(account.group_verified_at and account.group_id)


def _full_auth_response_for_account(account: AppAccount, request=None) -> dict:
    user = account.user
    tokens = make_full_tokens(user, request)

    if user.is_superuser or user.is_staff:
        return {
            **tokens,
            "skip_verify": True,
            "role": "admin",
            "full_name": user.get_full_name() or user.username,
            "username": user.username,
            "is_superuser": user.is_superuser,
            "two_fa_enabled": account.two_fa_enabled,
        }

    teacher = getattr(user, "teacher_profile", None)
    if teacher and teacher.is_active:
        return {
            **tokens,
            "skip_verify": True,
            "role": "teacher",
            "teacher_id": teacher.id,
            "full_name": teacher.full_name,
            "two_fa_enabled": account.two_fa_enabled,
        }

    student = account.student if account.student_id else getattr(user, "student_profile", None)
    group = account.group
    if student and student.is_active and group:
        return {
            **tokens,
            "skip_verify": True,
            "role": "student",
            "student_id": student.id,
            "full_name": student.full_name,
            "group_id": str(group.id),
            "group_name": group.name,
            "two_fa_enabled": account.two_fa_enabled,
        }

    if account.group_verified_at and group:
        student = ensure_student_for_account(account, group)
        return {
            **tokens,
            "skip_verify": True,
            "role": "student",
            "student_id": student.id,
            "full_name": student.full_name,
            "group_id": str(group.id),
            "group_name": group.name,
            "two_fa_enabled": account.two_fa_enabled,
        }

    raise ValueError("assigned role expected")


def _auth_step_response(account: AppAccount, request=None) -> dict:
    if _account_has_assigned_role(account):
        if account.two_fa_enabled:
            return _pending_2fa_response(account)
        return _full_auth_response_for_account(account, request)
    return _pending_response(account)


def _wants_mobile_bridge(request) -> bool:
    flag = request.data.get("mobile_bridge")
    if flag is True or str(flag).lower() in {"1", "true", "yes"}:
        return True
    return (request.headers.get("X-Mobile-Bridge") or "").strip().lower() in {"1", "true", "yes"}


def _get_link_token(request) -> str:
    return (
        (request.data.get("link_token") or request.query_params.get("link_token") or "")
        .strip()
    )


def _public_lk_origin() -> str:
    url = (getattr(settings, "APP_PUBLIC_URL", "") or "").strip().rstrip("/")
    if url:
        if "://" not in url:
            url = f"https://{url}"
        return url
    return "https://lk.mini-kbp.site"


def _respond_auth_payload(request, payload: dict) -> Response:
    link_token = _get_link_token(request)
    if link_token:
        # Завершаем mobile link только после полной выдачи JWT (не на pending/2FA).
        if payload.get("skip_verify") and payload.get("access") and payload.get("refresh"):
            if complete_mobile_web_link_token(link_token, payload):
                # JWT в Redis (poll) + mobile_code для deep link exchange
                return Response(
                    {
                        "status": "link_complete",
                        "mobile_code": issue_mobile_auth_code(payload),
                    }
                )
            return Response({"detail": "Ссылка входа недействительна или истекла"}, status=400)
        return Response(payload)
    if _wants_mobile_bridge(request):
        return Response({"mobile_code": issue_mobile_auth_code(payload)})
    resp = Response(payload)
    _attach_login_cookies(request, resp, payload)
    return resp


def _attach_login_cookies(request, resp: Response, payload: dict) -> None:
    """Сессия + JWT cookie на Domain=.mini-kbp.site — сразу в ответе логина, чтобы panel их видел."""
    if not payload.get("skip_verify") or not payload.get("access") or not payload.get("refresh"):
        return
    session = getattr(request, "_minikbp_new_session", None)
    if session is None:
        return
    from accounts.app_sessions import set_session_cookies

    role = str(payload.get("role") or "student")
    set_session_cookies(
        resp,
        session.account,
        session,
        role,
        access=payload["access"],
        refresh=payload["refresh"],
    )


def _respond_auth_step(request, account: AppAccount) -> Response:
    return _respond_auth_payload(request, _auth_step_response(account, request))


def _pending_2fa_response(account: AppAccount) -> dict:
    return {
        "pending_token": make_pending_token(account.user, step=STEP_2FA),
        "needs_2fa": True,
        "needs_curator_code": False,
        "display_name": account.display_name,
        "email": account.email,
    }


def _pending_response(account: AppAccount) -> dict:
    return {
        "pending_token": make_pending_token(account.user, step=STEP_VERIFY),
        "needs_curator_code": True,
        "needs_2fa": account.two_fa_enabled,
        "display_name": account.display_name,
        "email": account.email,
    }


def _email_is_verified(account: AppAccount) -> bool:
    if not account.email:
        return True
    user = account.user
    if user.is_superuser or user.is_staff:
        return True
    return account.email_verified_at is not None


def _registration_cache_key(account_id: int) -> str:
    return f"app_reg_verify:{account_id}"


def _send_registration_verification(account: AppAccount) -> tuple[bool, str | None]:
    code = f"{secrets.randbelow(900_000) + 100_000:06d}"
    cache.set(_registration_cache_key(account.pk), code, REG_EMAIL_TTL)
    if not outbound_email_enabled():
        if settings.DEBUG:
            return True, code
        return False, None
    token = _signer.sign(str(account.pk))
    magic_link = build_registration_magic_link(token)
    try:
        send_registration_email(to_email=account.email, magic_link=magic_link, code=code)
    except Exception:
        return False, None
    return True, None


def _ensure_teacher_for_account(account: AppAccount) -> Teacher:
    user = account.user
    teacher = getattr(user, "teacher_profile", None)
    if teacher:
        if not teacher.is_active:
            teacher.is_active = True
            teacher.save(update_fields=["is_active"])
        return teacher

    name = account.display_name or account.email or user.username
    return Teacher.objects.create(
        user=user,
        full_name=name,
        email=account.email or "",
        is_active=True,
    )


def _validate_invite_code(code: str, group: Group | None = None) -> CuratorInviteCode | None:
    normalized = code.strip().upper()
    qs = CuratorInviteCode.objects.filter(
        code__iexact=normalized,
        is_active=True,
        expires_at__gt=timezone.now(),
    ).select_related("group", "kbp_teacher")
    if group:
        qs = qs.filter(group=group)
    invite = qs.first()
    if not invite or invite.use_count >= invite.max_uses:
        return None
    return invite


def _lock_invite_code(code: str) -> CuratorInviteCode | None:
    """Блокировка строки кода в транзакции — защита от двойного использования."""
    normalized = code.strip().upper()
    try:
        invite = (
            CuratorInviteCode.objects.select_for_update()
            .select_related("group", "kbp_teacher")
            .get(
                code__iexact=normalized,
                is_active=True,
                expires_at__gt=timezone.now(),
            )
        )
    except CuratorInviteCode.DoesNotExist:
        return None
    if invite.use_count >= invite.max_uses:
        return None
    return invite


class AppRegisterView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AuthAnonRateThrottle]

    def post(self, request):
        # Registration disabled in mini-kbp-timetable fork.
        return Response(
            {"detail": "Регистрация отключена. Используйте существующий аккаунт."},
            status=410,
        )

        if request_is_panel_site(request):
            return Response(
                {"detail": "Регистрация на панели недоступна. Используйте lk.mini-kbp.site."},
                status=403,
            )
        email = (request.data.get("email") or "").strip().lower()
        password = request.data.get("password") or ""
        password2 = request.data.get("password_confirm") or password

        if not email or not password:
            return Response({"detail": "Электронная почта и пароль обязательны"}, status=400)
        if password != password2:
            return Response({"detail": "Пароли не совпадают"}, status=400)
        existing = AppAccount.objects.filter(email__iexact=email).select_related("user").first()
        if existing and _email_is_verified(existing):
            return Response({"detail": "Аккаунт с такой почтой уже есть"}, status=400)
        if existing and _registration_expired(existing):
            _purge_unverified_account(existing)
            existing = None
        try:
            validate_password(password)
        except ValidationError as e:
            return Response({"detail": " ".join(e.messages)}, status=400)

        account, created = get_or_create_app_account(email=email, password=password, display_name=email.split("@")[0])
        ref = (request.data.get("referral") or request.data.get("ref") or "").strip()[:64]
        if created and ref:
            account.referral_source = ref
            account.save(update_fields=["referral_source"])

        if not _email_is_verified(account):
            sent, dev_code = _send_registration_verification(account)
            if not sent:
                if created:
                    user = account.user
                    account.delete()
                    user.delete()
                return Response({"detail": "Не удалось отправить письмо"}, status=503)
            payload: dict = {"needs_email_verify": True, "email": email}
            if dev_code:
                payload["dev_code"] = dev_code
            return Response(payload)

        return _respond_auth_step(request, account)


class AppLoginView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AuthAnonRateThrottle]

    def post(self, request):
        email = (request.data.get("email") or "").strip().lower()
        password = request.data.get("password") or ""
        if not email or not password:
            return Response({"detail": "Электронная почта и пароль обязательны"}, status=400)

        account = AppAccount.objects.filter(email__iexact=email).select_related("user").first()
        user = None

        if account:
            user = authenticate(request, username=account.user.username, password=password)
        else:
            from django.db.models import Q

            candidate = User.objects.filter(Q(email__iexact=email) | Q(username__iexact=email)).first()
            if candidate:
                user = authenticate(request, username=candidate.username, password=password)
                if user and not AppAccount.objects.filter(user=user).exists():
                    account = AppAccount.objects.create(
                        user=user,
                        email=email if "@" in email else (user.email or None),
                        display_name=user.get_full_name() or user.username,
                    )

        if not user:
            return Response({"detail": "Неверная почта или пароль"}, status=401)

        if not account:
            account = AppAccount.objects.filter(user=user).first()
        if not account:
            account = AppAccount.objects.create(
                user=user,
                email=user.email or (email if "@" in email else None),
                display_name=user.get_full_name() or user.username,
            )

        if account.email and not _email_is_verified(account):
            if _registration_expired(account):
                _purge_unverified_account(account)
                return Response(
                    {"detail": "Срок подтверждения почты истёк — зарегистрируйтесь снова"},
                    status=401,
                )
            sent, dev_code = _send_registration_verification(account)
            if not sent:
                return Response({"detail": "Подтвердите email — не удалось отправить письмо"}, status=503)
            payload: dict = {
                "detail": "Подтвердите email — проверьте почту",
                "needs_email_verify": True,
                "email": account.email,
            }
            if dev_code:
                payload["dev_code"] = dev_code
            return Response(payload, status=403)

        return _respond_auth_step(request, account)


class AppTelegramLoginView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AuthAnonRateThrottle]

    def post(self, request):
        id_token = (request.data.get("id_token") or "").strip()
        code = (request.data.get("code") or "").strip()
        if code and not id_token:
            client_id = _telegram_bot_client_id()
            if not client_id:
                return Response({"detail": "Telegram-вход не настроен (TELEGRAM_BOT_TOKEN)"}, status=503)
            code_verifier = (request.data.get("code_verifier") or "").strip()
            redirect_uri = (request.data.get("redirect_uri") or "").strip()
            if not code_verifier or not redirect_uri:
                return Response({"detail": "code_verifier и redirect_uri обязательны"}, status=400)
            id_token = exchange_telegram_oidc_code(
                code=code,
                code_verifier=code_verifier,
                redirect_uri=redirect_uri,
                client_id=client_id,
            )
            if not id_token:
                return Response(
                    {"detail": "Не удалось обменять код Telegram (проверьте TELEGRAM_OIDC_CLIENT_SECRET и redirect URI в BotFather)"},
                    status=401,
                )

        if id_token:
            client_id = _telegram_bot_client_id()
            if not client_id:
                return Response({"detail": "Telegram-вход не настроен (TELEGRAM_BOT_TOKEN)"}, status=503)
            claims = verify_telegram_oidc_token(id_token, client_id=client_id)
            if not claims:
                return Response({"detail": "Неверный токен Telegram"}, status=401)
            try:
                telegram_id = int(claims.get("id") or claims.get("sub"))
            except (TypeError, ValueError):
                return Response({"detail": "Некорректный Telegram ID"}, status=400)
            display_name = (claims.get("name") or "").strip()
            username = (claims.get("preferred_username") or "").strip().lstrip("@")
            account, _ = get_or_create_app_account(
                telegram_id=telegram_id,
                telegram_username=username,
                display_name=display_name or username or f"Telegram {telegram_id}",
            )
            return _respond_auth_step(request, account)

        data = {k: v for k, v in dict(request.data).items() if k in TELEGRAM_AUTH_KEYS or k == "hash"}
        auth_date = int(data.get("auth_date") or 0)
        if timezone.now().timestamp() - auth_date > 86400:
            return Response({"detail": "Данные Telegram устарели"}, status=401)

        if _telegram_bot_token():
            if not verify_telegram_login(data):
                return Response({"detail": "Неверная подпись Telegram"}, status=401)
        elif not (settings.DEBUG or os.environ.get("APP_AUTH_ALLOW_DEV_TELEGRAM")):
            return Response(
                {"detail": "Telegram-вход не настроен (TELEGRAM_BOT_TOKEN)"},
                status=503,
            )

        try:
            telegram_id = int(data.get("id"))
        except (TypeError, ValueError):
            return Response({"detail": "Некорректный Telegram ID"}, status=400)

        first = (data.get("first_name") or "").strip()
        last = (data.get("last_name") or "").strip()
        display_name = " ".join(p for p in [first, last] if p).strip()
        username = (data.get("username") or "").strip()

        account, _ = get_or_create_app_account(
            telegram_id=telegram_id,
            telegram_username=username,
            display_name=display_name or username or f"Telegram {telegram_id}",
        )
        return _respond_auth_step(request, account)


class AppGoogleLoginView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AuthAnonRateThrottle]

    def post(self, request):
        credential = (
            (request.data.get("credential") or "")
            or (request.data.get("id_token") or "")
        ).strip()
        if not credential:
            return Response({"detail": "credential обязателен"}, status=400)

        client_id = _google_oauth_client_id()
        if not client_id:
            return Response({"detail": "Google-вход не настроен (GOOGLE_OAUTH_CLIENT_ID)"}, status=503)

        claims = verify_google_credential(credential, client_id=client_id)
        if not claims:
            return Response({"detail": "Неверный токен Google"}, status=401)

        google_sub = (claims.get("sub") or "").strip()
        if not google_sub:
            return Response({"detail": "Некорректный Google ID"}, status=400)

        email = (claims.get("email") or "").strip()
        if not email:
            return Response({"detail": "Google не вернул email"}, status=400)
        if claims.get("email_verified") is False:
            return Response({"detail": "Email Google не подтверждён"}, status=401)

        display_name = (claims.get("name") or "").strip()
        avatar_url = (claims.get("picture") or "").strip()
        account, _ = get_or_create_google_account(
            google_sub=google_sub,
            email=email,
            display_name=display_name or email.split("@")[0],
            avatar_url=avatar_url,
        )
        return _respond_auth_step(request, account)


class AppTelegramLinkStartView(APIView):
    """Native app: выдать токен для /start в Telegram-боте."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [AuthAnonRateThrottle]

    def post(self, request):
        if not _telegram_bot_token():
            return Response({"detail": "Telegram-бот не настроен (TELEGRAM_BOT_TOKEN)"}, status=503)
        bot = (
            os.environ.get("TELEGRAM_BOT_USERNAME")
            or os.environ.get("NEXT_PUBLIC_TELEGRAM_BOT_USERNAME")
            or ""
        ).strip().lstrip("@")
        if not bot:
            return Response({"detail": "TELEGRAM_BOT_USERNAME не задан"}, status=503)
        account_id = None
        user = getattr(request, "user", None)
        if user is not None and getattr(user, "is_authenticated", False):
            account_id = (
                AppAccount.objects.filter(user=user).values_list("pk", flat=True).first()
            )
        token = issue_telegram_link_token(account_id=account_id)
        return Response(
            {
                "token": token,
                "bot_username": bot,
                "telegram_url": f"https://t.me/{bot}?start={token}",
            }
        )


class AppTelegramLinkPollView(APIView):
    """Native app: polling после /start TOKEN в боте."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        token = (request.query_params.get("token") or "").strip()
        if not token:
            return Response({"detail": "token обязателен"}, status=400)
        payload = poll_telegram_link_token(token)
        if payload is None:
            return Response({"status": "expired"}, status=404)
        if payload.get("status") == "pending":
            return Response({"status": "pending"})
        return Response(payload)


class AppMobileAuthExchangeView(APIView):
    """Обмен одноразового mobile_code (Custom Tab / deep link) на auth payload."""

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        code = (request.data.get("code") or "").strip()
        if not code:
            return Response({"detail": "code обязателен"}, status=400)
        payload = consume_mobile_auth_code(code)
        if payload is None:
            return Response({"detail": "Код недействителен или истёк"}, status=401)
        return Response(payload)


class AppMobileWebLinkStartView(APIView):
    """Native app: выдать link_token и URL для входа через Chrome (polling)."""

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        kind = (request.data.get("kind") or "").strip().lower()
        if kind not in {"google", "telegram", "site", "qr"}:
            return Response({"detail": "kind должен быть google, telegram, site или qr"}, status=400)
        if kind == "google" and not _google_oauth_client_id():
            return Response({"detail": "Google-вход не настроен (GOOGLE_OAUTH_CLIENT_ID)"}, status=503)
        token = issue_mobile_web_link_token(kind)
        origin = _public_lk_origin()
        if kind in {"site", "qr"}:
            auth_url = f"{origin}/app?link_token={token}" + ("&from=qr" if kind == "qr" else "")
        else:
            # Chooser на /auth/cb — без provider, пользователь выбирает Google/Telegram сам
            auth_url = f"{origin}/auth/cb?from=app&link_token={token}"
        return Response({"token": token, "auth_url": auth_url, "kind": kind})


class AppMobileWebLinkCompleteView(APIView):
    """Сайт: пользователь уже вошёл — завершить mobile link для приложения."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        link_token = _get_link_token(request)
        if not link_token:
            return Response({"detail": "link_token обязателен"}, status=400)
        account = AppAccount.objects.filter(user=request.user).select_related("user", "group", "student").first()
        if not account:
            return Response({"detail": "Аккаунт не найден"}, status=404)
        if _account_has_assigned_role(account):
            return _respond_auth_payload(request, _full_auth_response_for_account(account, request))
        return _respond_auth_step(request, account)


class AppMobileWebLinkPollView(APIView):
    """Native app: polling после входа на сайте."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        token = (request.query_params.get("token") or "").strip()
        if not token:
            return Response({"detail": "token обязателен"}, status=400)
        payload = poll_mobile_web_link_token(token)
        if payload is None:
            return Response({"status": "expired"}, status=404)
        if payload.get("status") == "pending":
            return Response({"status": "pending"})
        return Response(payload)


class PublicAppConfigView(APIView):
    """Публичные настройки клиента (без секретов)."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        bot = (
            os.environ.get("TELEGRAM_BOT_USERNAME")
            or os.environ.get("NEXT_PUBLIC_TELEGRAM_BOT_USERNAME")
            or ""
        ).strip().lstrip("@")
        return Response(
            {
                "telegram_bot_username": bot or None,
                "telegram_bot_client_id": _telegram_bot_client_id(),
                "telegram_login_enabled": bool(bot and _telegram_bot_token()),
                "telegram_login_host": (
                    os.environ.get("APP_PUBLIC_URL", "").strip().rstrip("/").split("://")[-1].split("/")[0]
                    or "lk.mini-kbp.site"
                ),
                "google_client_id": _google_oauth_client_id(),
                "google_login_enabled": bool(_google_oauth_client_id()),
            }
        )


class AppVerifyView(APIView):
    """Код куратора + опционально 2FA → полная сессия."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [AuthAnonRateThrottle]

    def post(self, request):
        pending_raw = (request.data.get("pending_token") or "").strip()
        curator_code = (request.data.get("curator_code") or "").strip()
        totp_code = (request.data.get("totp_code") or "").strip()

        token = parse_pending_token(pending_raw)
        if not token:
            return Response({"detail": "Сессия истекла — войдите снова"}, status=401)

        if not curator_code:
            return Response({"detail": "Введите код"}, status=400)

        try:
            user = User.objects.get(pk=token["user_id"])
        except User.DoesNotExist:
            return Response({"detail": "Пользователь не найден"}, status=404)

        account = AppAccount.objects.filter(user=user).first()
        if not account:
            return Response({"detail": "Аккаунт не найден"}, status=404)

        invite = _validate_invite_code(curator_code)
        if not invite:
            return Response({"detail": "Неверный или просроченный код"}, status=403)

        if token.get(STEP_CLAIM) == STEP_2FA:
            return Response({"detail": "Используйте вход с кодом 2FA"}, status=400)

        if account.two_fa_enabled:
            if not totp_code:
                return Response(
                    {
                        "detail": "Требуется код 2FA",
                        "needs_2fa": True,
                        "pending_token": make_pending_token(user, step=STEP_VERIFY),
                    },
                    status=428,
                )
            totp = pyotp.TOTP(account.two_fa_secret)
            if not totp.verify(totp_code, valid_window=1):
                return Response({"detail": "Неверный код 2FA"}, status=403)

        existing_teacher = getattr(user, "teacher_profile", None)

        with transaction.atomic():
            invite = _lock_invite_code(curator_code)
            if not invite:
                return Response({"detail": "Неверный или просроченный код"}, status=403)

            if invite.role == CuratorInviteCode.Role.STUDENT and not invite.group_id:
                return Response({"detail": "Код студента без группы"}, status=403)

            if invite.role == CuratorInviteCode.Role.STUDENT and existing_teacher and existing_teacher.is_active:
                return Response({"detail": "У аккаунта уже есть роль преподавателя"}, status=403)
            if invite.role == CuratorInviteCode.Role.TEACHER and account.student_id:
                return Response({"detail": "У аккаунта уже есть роль студента"}, status=403)

            if invite.role == CuratorInviteCode.Role.TEACHER and invite.kbp_teacher_id:
                taken = (
                    Teacher.objects.filter(kbp_teacher_id=invite.kbp_teacher_id)
                    .exclude(user=user)
                    .exists()
                )
                if taken:
                    return Response(
                        {"detail": "Этот преподаватель kbp уже привязан"},
                        status=400,
                    )

            invite.use_count += 1
            invite.used_by = account
            invite.used_at = timezone.now()
            if invite.use_count >= invite.max_uses:
                invite.is_active = False
            invite.save(update_fields=["use_count", "used_by", "used_at", "is_active"])

            tokens = make_full_tokens(user, request)

            if invite.role == CuratorInviteCode.Role.TEACHER:
                teacher = _ensure_teacher_for_account(account)
                if invite.kbp_teacher_id:
                    teacher.kbp_teacher = invite.kbp_teacher
                    if invite.kbp_teacher and invite.kbp_teacher.name:
                        teacher.full_name = invite.kbp_teacher.name
                    teacher.save(update_fields=["kbp_teacher", "full_name", "updated_at"])
                return _respond_auth_payload(
                    request,
                    {
                        **tokens,
                        "skip_verify": True,
                        "role": "teacher",
                        "teacher_id": teacher.id,
                        "full_name": teacher.full_name,
                        "kbp_teacher_id": teacher.kbp_teacher_id,
                        "two_fa_enabled": account.two_fa_enabled,
                    },
                )

            account.group = invite.group
            account.group_verified_at = timezone.now()
            account.save(update_fields=["group", "group_verified_at"])

            student = ensure_student_for_account(account, invite.group)
            return _respond_auth_payload(
                request,
                {
                    **tokens,
                    "skip_verify": True,
                    "role": "student",
                    "student_id": student.id,
                    "full_name": student.full_name,
                    "group_id": str(invite.group_id),
                    "group_name": invite.group.name,
                    "two_fa_enabled": account.two_fa_enabled,
                },
            )


class AppVerifyEmailView(APIView):
    """Подтверждение почты после регистрации — magic link или код."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [AuthAnonRateThrottle]

    def post(self, request):
        token = (request.data.get("token") or "").strip()
        code = (request.data.get("code") or "").strip()

        account: AppAccount | None = None
        if token:
            try:
                account_id = int(_signer.unsign(token, max_age=REG_EMAIL_TTL))
            except (BadSignature, SignatureExpired, ValueError):
                return Response({"detail": "Ссылка недействительна или устарела"}, status=400)
            account = AppAccount.objects.filter(pk=account_id).select_related("user").first()
        elif code and (request.data.get("email") or "").strip():
            email = str(request.data.get("email")).strip().lower()
            account = AppAccount.objects.filter(email__iexact=email).select_related("user").first()
            cached = cache.get(_registration_cache_key(account.pk)) if account else None
            if not cached or cached != code:
                return Response({"detail": "Неверный или просроченный код"}, status=400)
        else:
            return Response({"detail": "Укажите token или код"}, status=400)

        if not account:
            return Response({"detail": "Аккаунт не найден"}, status=404)

        if _registration_expired(account):
            _purge_unverified_account(account)
            return Response({"detail": "Срок подтверждения истёк — зарегистрируйтесь снова"}, status=400)

        if not account.email_verified_at:
            account.email_verified_at = timezone.now()
            account.save(update_fields=["email_verified_at"])
        cache.delete(_registration_cache_key(account.pk))

        return _respond_auth_step(request, account)


class AppTwoFaLoginView(APIView):
    """2FA при входе для аккаунтов с уже назначенной ролью."""

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        pending_raw = (request.data.get("pending_token") or "").strip()
        totp_code = (request.data.get("totp_code") or "").strip()
        if not totp_code:
            return Response({"detail": "Введите код из приложения"}, status=400)

        token = parse_pending_token(pending_raw)
        if not token or token.get(STEP_CLAIM) != STEP_2FA:
            return Response({"detail": "Сессия истекла — войдите снова"}, status=401)

        try:
            user = User.objects.get(pk=token["user_id"])
        except User.DoesNotExist:
            return Response({"detail": "Пользователь не найден"}, status=404)

        account = AppAccount.objects.filter(user=user).first()
        if not account or not account.two_fa_enabled:
            return Response({"detail": "2FA не включена"}, status=400)

        totp = pyotp.TOTP(account.two_fa_secret)
        if not totp.verify(totp_code, valid_window=1):
            return Response({"detail": "Неверный код 2FA"}, status=403)

        if not _account_has_assigned_role(account):
            return Response({"detail": "Роль не назначена"}, status=403)

        return _respond_auth_payload(request, _full_auth_response_for_account(account, request))


PWD_RESET_TTL = 900


def _pwd_reset_cache_key(account_id: int) -> str:
    return f"app_pwd_reset:{account_id}"


class AppPasswordResetRequestView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AuthAnonRateThrottle]

    def post(self, request):
        email = (request.data.get("email") or "").strip().lower()
        if not email:
            return Response({"detail": "Укажите email"}, status=400)
        account = AppAccount.objects.filter(email__iexact=email).select_related("user").first()
        if not account:
            return Response({"ok": True})
        code = f"{secrets.randbelow(900_000) + 100_000:06d}"
        cache.set(_pwd_reset_cache_key(account.pk), code, PWD_RESET_TTL)
        if settings.DEBUG:
            return Response({"ok": True, "dev_code": code})
        try:
            send_password_reset_email(to_email=email, code=code)
        except Exception:
            return Response({"detail": "Не удалось отправить письмо"}, status=503)
        return Response({"ok": True})


class AppPasswordResetConfirmView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AuthAnonRateThrottle]

    def post(self, request):
        email = (request.data.get("email") or "").strip().lower()
        code = (request.data.get("code") or "").strip()
        password = request.data.get("password") or ""
        password2 = request.data.get("password_confirm") or password
        if not email or not code or not password:
            return Response({"detail": "Email, код и пароль обязательны"}, status=400)
        if password != password2:
            return Response({"detail": "Пароли не совпадают"}, status=400)
        account = AppAccount.objects.filter(email__iexact=email).select_related("user").first()
        if not account:
            return Response({"detail": "Неверный код"}, status=400)
        cached = cache.get(_pwd_reset_cache_key(account.pk))
        if not cached or cached != code:
            return Response({"detail": "Неверный или просроченный код"}, status=400)
        try:
            validate_password(password, account.user)
        except ValidationError as e:
            return Response({"detail": " ".join(e.messages)}, status=400)
        account.user.set_password(password)
        account.user.save(update_fields=["password"])
        cache.delete(_pwd_reset_cache_key(account.pk))
        return Response({"ok": True})


class CuratorInviteCodeView(APIView):
    """Обратная совместимость: POST создаёт одноразовый код студента для группы."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        from academics.invite_views import create_role_invite, _serialize_invite

        payload = {**request.data, "role": "student", "max_uses": 1}
        invite, err = create_role_invite(request, payload)
        if err:
            return err
        return Response(_serialize_invite(invite), status=201)
