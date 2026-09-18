"""Профиль пользователя личного кабинета."""

import secrets

import pyotp
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from accounts.mail_utils import outbound_email_enabled
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import AppAccount
from accounts.profile_fields import avatar_url_error, display_name_error, info_error, phone_error

User = get_user_model()

EMAIL_CODE_TTL = 900


def _profile_payload(account: AppAccount) -> dict:
    group = account.group
    return {
        "email": account.email or "",
        "nickname": account.nickname or "",
        "display_name": account.display_name or "",
        "avatar_url": account.avatar_url or "",
        "phone": account.phone or "",
        "gender": account.gender or "",
        "info": account.info or "",
        "show_group": account.show_group,
        "group_id": str(group.id) if group else None,
        "group_name": group.name if group else None,
        "has_group": group is not None,
        "has_telegram": bool(account.telegram_id),
        "telegram_username": account.telegram_username or "",
        "two_fa_enabled": account.two_fa_enabled,
        "session_ttl_days": account.session_ttl_days,
        "profile_locked": account.profile_locked,
        "profile_locked_at": account.profile_locked_at.isoformat() if account.profile_locked_at else None,
    }


def _email_code_cache_key(account_id: int) -> str:
    return f"app_profile_email:{account_id}"


class AppProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _account(self, request) -> AppAccount | None:
        account = AppAccount.objects.filter(user=request.user).select_related("group").first()
        if account:
            return account
        user = request.user
        if not user.is_authenticated:
            return None
        teacher = getattr(user, "teacher_profile", None)
        if user.is_staff or user.is_superuser or (teacher and teacher.is_active):
            display = user.get_full_name() or user.username
            if teacher and teacher.full_name:
                display = teacher.full_name
            return AppAccount.objects.create(
                user=user,
                email=user.email or None,
                display_name=display,
            )
        return None

    def get(self, request):
        account = self._account(request)
        if not account:
            return Response({"detail": "Профиль не найден"}, status=404)
        return Response(_profile_payload(account))

    def patch(self, request):
        account = self._account(request)
        if not account:
            return Response({"detail": "Профиль не найден"}, status=404)

        if account.profile_locked:
            return Response(
                {"detail": "Профиль заблокирован преподавателем"},
                status=403,
            )

        data = request.data
        if "nickname" in data:
            account.nickname = str(data.get("nickname") or "")[:64]
        if "display_name" in data:
            name = str(data.get("display_name") or "")[:255]
            err = display_name_error(name)
            if err:
                return Response({"detail": err}, status=400)
            account.display_name = name
        if "phone" in data:
            phone = str(data.get("phone") or "")[:32]
            err = phone_error(phone)
            if err:
                return Response({"detail": err}, status=400)
            account.phone = phone
        if "gender" in data:
            g = str(data.get("gender") or "")
            if g in ("", "male", "female", "other"):
                account.gender = g
        if "info" in data:
            info = str(data.get("info") or "")[:2000]
            err = info_error(info)
            if err:
                return Response({"detail": err}, status=400)
            account.info = info
        if "show_group" in data:
            account.show_group = bool(data.get("show_group"))
        if "avatar_url" in data:
            avatar = str(data.get("avatar_url") or "")
            err = avatar_url_error(avatar)
            if err:
                return Response({"detail": err}, status=400)
            account.avatar_url = avatar

        if "email" in data:
            new_email = str(data.get("email") or "").strip().lower()
            if new_email and new_email != (account.email or ""):
                return Response(
                    {"detail": "Для смены email подтвердите код из письма"},
                    status=400,
                )

        if "session_ttl_days" in data:
            try:
                days = int(data.get("session_ttl_days"))
                if 1 <= days <= 365:
                    account.session_ttl_days = days
            except (TypeError, ValueError):
                pass

        account.save()
        return Response(_profile_payload(account))


class AppProfileEmailRequestView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        account = AppProfileView()._account(request)
        if not account:
            return Response({"detail": "Профиль не найден"}, status=404)

        new_email = str(request.data.get("email") or "").strip().lower()
        if not new_email or "@" not in new_email:
            return Response({"detail": "Укажите корректный email"}, status=400)
        if new_email == (account.email or ""):
            return Response({"detail": "Это уже ваш текущий email"}, status=400)
        if AppAccount.objects.filter(email__iexact=new_email).exclude(pk=account.pk).exists():
            return Response({"detail": "Email уже занят"}, status=400)

        code = f"{secrets.randbelow(900_000) + 100_000:06d}"
        cache.set(
            _email_code_cache_key(account.pk),
            {"email": new_email, "code": code},
            EMAIL_CODE_TTL,
        )

        if not outbound_email_enabled():
            return Response({"ok": True, "email": new_email, "dev_code": code})

        try:
            from django.core.mail import send_mail

            send_mail(
                subject="Код подтверждения MiniKBP",
                message=f"Ваш код для смены email: {code}\n\nКод действует 15 минут.",
                from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@minikbp.local"),
                recipient_list=[new_email],
                fail_silently=False,
            )
        except Exception:
            return Response({"detail": "Не удалось отправить письмо"}, status=503)

        return Response({"ok": True, "email": new_email})


class AppProfileEmailConfirmView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        account = AppProfileView()._account(request)
        if not account:
            return Response({"detail": "Профиль не найден"}, status=404)

        code = str(request.data.get("code") or "").strip()
        cached = cache.get(_email_code_cache_key(account.pk))
        if not cached or str(cached.get("code")) != code:
            return Response({"detail": "Неверный или просроченный код"}, status=400)

        new_email = str(cached.get("email") or "").strip().lower()
        if not new_email:
            return Response({"detail": "Код недействителен"}, status=400)
        if AppAccount.objects.filter(email__iexact=new_email).exclude(pk=account.pk).exists():
            cache.delete(_email_code_cache_key(account.pk))
            return Response({"detail": "Email уже занят"}, status=400)

        account.email = new_email
        account.user.email = new_email
        account.user.save(update_fields=["email"])
        account.save(update_fields=["email"])
        cache.delete(_email_code_cache_key(account.pk))
        return Response(_profile_payload(account))


class AppProfileTwoFaSetupView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        account = AppProfileView()._account(request)
        if not account:
            return Response({"detail": "Профиль не найден"}, status=404)
        if account.two_fa_enabled:
            return Response({"detail": "2FA уже включена"}, status=400)

        secret = pyotp.random_base32()
        account.two_fa_secret = secret
        account.save(update_fields=["two_fa_secret"])

        totp = pyotp.TOTP(secret)
        email = account.email or ""
        label = email.split("@")[0] if email else str(account.pk)
        return Response(
            {
                "secret": secret,
                "otpauth_url": totp.provisioning_uri(name=label, issuer_name="KBP"),
            }
        )


class AppProfileTwoFaEnableView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        account = AppProfileView()._account(request)
        if not account:
            return Response({"detail": "Профиль не найден"}, status=404)
        if account.two_fa_enabled:
            return Response({"detail": "2FA уже включена"}, status=400)
        if not account.two_fa_secret:
            return Response({"detail": "Сначала запросите настройку 2FA"}, status=400)

        code = str(request.data.get("totp_code") or "").strip()
        totp = pyotp.TOTP(account.two_fa_secret)
        if not totp.verify(code, valid_window=1):
            return Response({"detail": "Неверный код из приложения"}, status=400)

        account.two_fa_enabled = True
        account.save(update_fields=["two_fa_enabled"])
        return Response(_profile_payload(account))


class AppProfileTwoFaDisableView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        account = AppProfileView()._account(request)
        if not account:
            return Response({"detail": "Профиль не найден"}, status=404)
        if not account.two_fa_enabled:
            return Response({"detail": "2FA не включена"}, status=400)

        code = str(request.data.get("totp_code") or "").strip()
        totp = pyotp.TOTP(account.two_fa_secret)
        if not totp.verify(code, valid_window=1):
            return Response({"detail": "Неверный код из приложения"}, status=400)

        account.two_fa_enabled = False
        account.two_fa_secret = ""
        account.save(update_fields=["two_fa_enabled", "two_fa_secret"])
        return Response(_profile_payload(account))


class AppProfileDeleteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        from django.db import transaction

        from accounts.models import AppSession
        from accounts.person_name import names_match

        account = AppProfileView()._account(request)
        if not account:
            return Response({"detail": "Профиль не найден"}, status=404)

        user = request.user
        teacher = getattr(user, "teacher_profile", None)
        if user.is_staff or user.is_superuser or teacher:
            return Response(
                {"detail": "Учётную запись сотрудника нельзя удалить из профиля"},
                status=status.HTTP_403_FORBIDDEN,
            )

        confirm_email = str(request.data.get("confirm_email") or "").strip()
        confirm_name = str(request.data.get("confirm_name") or "")
        password = str(request.data.get("password") or "")
        totp_code = str(request.data.get("totp_code") or "").strip()

        if account.email:
            if confirm_email.casefold() != str(account.email).strip().casefold():
                return Response({"detail": "Введите email аккаунта для подтверждения"}, status=400)
        elif not names_match(confirm_name, account.display_name):
            return Response({"detail": "Введите имя аккаунта для подтверждения"}, status=400)

        if user.has_usable_password() and not user.check_password(password):
            return Response({"detail": "Неверный пароль"}, status=400)

        if account.two_fa_enabled:
            if not account.two_fa_secret:
                return Response({"detail": "2FA настроена некорректно"}, status=400)
            if not pyotp.TOTP(account.two_fa_secret).verify(totp_code, valid_window=1):
                return Response({"detail": "Неверный код из приложения"}, status=400)

        student = account.student
        user_id = user.pk
        with transaction.atomic():
            AppSession.objects.filter(account=account).delete()
            if student is not None:
                account.student = None
                account.save(update_fields=["student"])
                if student.user_id == user_id:
                    student.user = None
                    student.save(update_fields=["user"])
            account.delete()
            User.objects.filter(pk=user_id).delete()

        return Response(status=status.HTTP_204_NO_CONTENT)
