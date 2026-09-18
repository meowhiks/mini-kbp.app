"""JWT с проверкой AppSession — завершённая сессия отклоняет токен."""

from __future__ import annotations

from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

from accounts.app_sessions import ACCESS_COOKIE
from accounts.models import AppAccount, AppSession


class SessionBoundJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        header = self.get_header(request)
        try:
            if header is None:
                raw = request.COOKIES.get(ACCESS_COOKIE)
                if not raw:
                    return None
                # Просроченный/битый cookie не должен ломать AllowAny (логин Google/Telegram).
                try:
                    validated_token = self.get_validated_token(raw)
                except (InvalidToken, TokenError, AuthenticationFailed):
                    return None
                user = self.get_user(validated_token)
                result = (user, validated_token)
            else:
                try:
                    result = super().authenticate(request)
                except (InvalidToken, TokenError, AuthenticationFailed):
                    # Битый Bearer — как аноним (иначе /auth/app/* падают до view).
                    return None
                if result is None:
                    return None

            user, validated_token = result
            sid = validated_token.get("sid")
            if sid is None:
                return user, validated_token

            try:
                sid_int = int(sid)
            except (TypeError, ValueError):
                return None

            session = (
                AppSession.objects.filter(pk=sid_int, revoked_at__isnull=True)
                .select_related("account", "account__user")
                .first()
            )
            if not session or not session.is_active:
                return None
            if session.account.user_id != user.pk:
                return None

            session.last_seen = timezone.now()
            session.save(update_fields=["last_seen"])
            return user, validated_token
        except AuthenticationFailed:
            return None


def create_session_tokens(user, request) -> dict[str, str]:
    """Создать AppSession и выдать JWT с claim sid (для аккаунтов /app)."""
    from accounts.jwt_tokens import issue_token_pair

    account = AppAccount.objects.filter(user=user).first()
    if not account and request is not None:
        teacher = getattr(user, "teacher_profile", None)
        if user.is_staff or user.is_superuser or (teacher and teacher.is_active):
            display = user.get_full_name() or user.username
            if teacher and teacher.full_name:
                display = teacher.full_name
            account = AppAccount.objects.create(
                user=user,
                email=user.email or None,
                display_name=display,
            )
    if not account or request is None:
        return issue_token_pair(user, request)

    from accounts.app_sessions import create_app_session

    session = create_app_session(account, request)
    request._minikbp_new_session = session
    return issue_token_pair(user, request, session_id=session.pk)
