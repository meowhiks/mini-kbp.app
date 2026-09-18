"""
Unit-тесты accounts/.

Покрывают:
- модель Teacher (создание, строковое представление)
- модель Student (уникальность record_book_number)
- вход учителя через TeacherLoginView (успех, неверный пароль, не-учитель, деактивирован)
- TeacherViewSet (создание с паролем, /teachers/me/)
"""

from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from datetime import date
from unittest.mock import patch

from academics.models import Group, Subject, Enrollment, TeachingAssignment, Grade, JournalDay, GroupCurator
from .models import Teacher, Student

User = get_user_model()


class TeacherModelTests(TestCase):
    def test_create_teacher(self):
        user = User.objects.create_user(username="ivanov", password="pw12345!A")
        teacher = Teacher.objects.create(
            user=user, full_name="Иванов И.И.", email="i@x.com"
        )
        self.assertEqual(str(teacher), "Иванов И.И.")
        self.assertTrue(teacher.is_active)
        self.assertEqual(teacher.user.username, "ivanov")

    def test_user_deletion_cascades(self):
        user = User.objects.create_user(username="petrov", password="pw12345!A")
        teacher = Teacher.objects.create(user=user, full_name="Петров П.П.")
        teacher_id = teacher.id
        user.delete()
        self.assertFalse(Teacher.objects.filter(id=teacher_id).exists())


class StudentModelTests(TestCase):
    def test_record_book_unique(self):
        Student.objects.create(
            full_name="Сидоров С.", record_book_number="ЗК-001"
        )
        from django.db import IntegrityError

        with self.assertRaises(IntegrityError):
            Student.objects.create(
                full_name="Другой студент", record_book_number="ЗК-001"
            )

    def test_str(self):
        s = Student.objects.create(
            full_name="Сидоров С.", record_book_number="ЗК-002"
        )
        self.assertEqual(str(s), "Сидоров С. (ЗК-002)")


class TeacherLoginViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user = User.objects.create_user(
            username="teacher1", password="StrongPass1!"
        )
        self.teacher = Teacher.objects.create(
            user=user, full_name="Учитель Один", is_active=True
        )

    def test_login_success(self):
        resp = self.client.post(
            "/v0/auth/login/",
            {"username": "teacher1", "password": "StrongPass1!"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIn("access", resp.data)
        self.assertIn("refresh", resp.data)
        self.assertEqual(resp.data["teacher_id"], self.teacher.id)

    def test_login_wrong_password(self):
        resp = self.client.post(
            "/v0/auth/login/",
            {"username": "teacher1", "password": "wrong"},
            format="json",
        )
        self.assertEqual(resp.status_code, 401)

    def test_login_missing_fields(self):
        resp = self.client.post("/v0/auth/login/", {}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_login_user_without_teacher_profile(self):
        User.objects.create_user(username="plain", password="x1234567!")
        resp = self.client.post(
            "/v0/auth/login/",
            {"username": "plain", "password": "x1234567!"},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

    def test_login_deactivated_teacher(self):
        self.teacher.is_active = False
        self.teacher.save()
        resp = self.client.post(
            "/v0/auth/login/",
            {"username": "teacher1", "password": "StrongPass1!"},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)


class TokenRefreshTests(TestCase):
    def test_garbage_refresh_asks_to_retry(self):
        client = APIClient()
        resp = client.post("/v0/auth/refresh/", {"refresh": "not-a-token"}, format="json")
        self.assertEqual(resp.status_code, 401)
        self.assertIn("Попробуйте ещё раз", resp.data["detail"])


class TeacherViewSetTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user = User.objects.create_user(
            username="admin", password="AdminPass1!", is_staff=True
        )
        Teacher.objects.create(user=user, full_name="Админ")
        # логинимся
        resp = self.client.post(
            "/v0/auth/login/",
            {"username": "admin", "password": "AdminPass1!"},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['access']}")

    def test_create_teacher_with_password(self):
        resp = self.client.post(
            "/v0/teachers/",
            {
                "username": "newteacher",
                "password": "NewPass123!",
                "full_name": "Новый Учитель",
                "email": "n@x.com",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["full_name"], "Новый Учитель")
        # User реально создан и может залогиниться
        login = self.client.post(
            "/v0/auth/login/",
            {"username": "newteacher", "password": "NewPass123!"},
            format="json",
        )
        self.assertEqual(login.status_code, 200)

    def test_me_endpoint(self):
        resp = self.client.get("/v0/teachers/me/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["full_name"], "Админ")

    def test_list_requires_auth(self):
        anon = APIClient()
        resp = anon.get("/v0/teachers/")
        self.assertEqual(resp.status_code, 401)


class AdminLoginViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.staff_user = User.objects.create_user(
            username="staffadmin",
            password="StaffPass1!",
            is_staff=True,
        )
        self.plain_user = User.objects.create_user(
            username="plainuser",
            password="PlainPass1!",
        )

    def test_admin_login_success(self):
        resp = self.client.post(
            "/v0/auth/admin-login/",
            {"username": "staffadmin", "password": "StaffPass1!"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIn("access", resp.data)
        self.assertTrue(resp.data["is_staff"])

    def test_admin_login_non_staff_forbidden(self):
        resp = self.client.post(
            "/v0/auth/admin-login/",
            {"username": "plainuser", "password": "PlainPass1!"},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

    def test_admin_login_wrong_password(self):
        resp = self.client.post(
            "/v0/auth/admin-login/",
            {"username": "staffadmin", "password": "wrong"},
            format="json",
        )
        self.assertEqual(resp.status_code, 401)


class StudentApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.group = Group.objects.create(name="ИС-21")
        self.student = Student.objects.create(
            full_name="Иванов Иван",
            record_book_number="ЗК-101",
            birth_date=date(2005, 3, 15),
        )
        Enrollment.objects.create(student=self.student, group=self.group)
        self.subject = Subject.objects.create(name="Математика", short_name="МАТ")
        self.teacher_user = User.objects.create_user(username="t1", password="x1234567!")
        self.teacher = Teacher.objects.create(user=self.teacher_user, full_name="Учитель 1")
        self.assignment = TeachingAssignment.objects.create(
            teacher=self.teacher,
            group=self.group,
            subject=self.subject,
        )
        day = date(2026, 6, 25)
        Grade.objects.create(
            assignment=self.assignment,
            student=self.student,
            date=day,
            value="8",
        )
        JournalDay.objects.create(assignment=self.assignment, date=day)
        from accounts.student_link import ensure_student_user, ensure_app_account_for_student_login
        from rest_framework_simplejwt.tokens import AccessToken

        self.student_user = ensure_student_user(self.student)
        ensure_app_account_for_student_login(self.student, self.group, self.student_user)
        self.student_access = str(AccessToken.for_user(self.student_user))

    def test_public_groups_requires_auth(self):
        resp = self.client.get("/v0/public/groups/")
        self.assertEqual(resp.status_code, 401)

    def test_public_groups_scoped_for_student(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.student_access}")
        resp = self.client.get("/v0/public/groups/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["name"], "ИС-21")

    def test_student_login_disabled(self):
        resp = self.client.post(
            "/v0/auth/student-login/",
            {
                "student_name": "Иванов",
                "group_id": str(self.group.id),
                "birth_day": "15.03.2005",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 410)

    def test_student_journal(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.student_access}")
        resp = self.client.get("/v0/student/journal/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("subjects", resp.data)
        self.assertEqual(len(resp.data["subjects"]), 1)
        self.assertEqual(resp.data["subjects"][0]["name"], "МАТ")
        self.assertEqual(resp.data["subjects"][0]["fullName"], "Математика")

    def test_student_lateness(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.student_access}")
        resp = self.client.get("/v0/student/lateness/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("subjects", resp.data)


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class AppAuthTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.group = Group.objects.create(name="ИС-22")
        staff = User.objects.create_user(username="staff1", password="StaffPass1!", is_staff=True)
        self.teacher = Teacher.objects.create(user=staff, full_name="Куратор")
        GroupCurator.objects.create(teacher=self.teacher, group=self.group)
        from academics.models import CuratorInviteCode
        from django.utils import timezone
        from datetime import timedelta

        self.invite = CuratorInviteCode.objects.create(
            role=CuratorInviteCode.Role.STUDENT,
            group=self.group,
            code="123456",
            created_by=self.teacher,
            expires_at=timezone.now() + timedelta(days=1),
        )

    def _verify_registration_email(self, email: str) -> dict:
        from django.core import mail
        import re

        reg = self.client.post(
            "/v0/auth/app/register/",
            {"email": email, "password": "GoodPass123!", "password_confirm": "GoodPass123!"},
            format="json",
        )
        self.assertEqual(reg.status_code, 200, reg.data)
        self.assertTrue(reg.data.get("needs_email_verify"))
        dev_code = reg.data.get("dev_code")
        if not dev_code:
            self.assertEqual(len(mail.outbox), 1)
            match = re.search(r"(\d{6})", mail.outbox[0].body)
            self.assertIsNotNone(match)
            dev_code = match.group(1)
        verify_email = self.client.post(
            "/v0/auth/app/verify-email/",
            {"email": email, "code": dev_code},
            format="json",
        )
        self.assertEqual(verify_email.status_code, 200, verify_email.data)
        return verify_email.data

    def test_register_and_verify(self):
        data = self._verify_registration_email("student@test.by")
        pending = data["pending_token"]

        verify = self.client.post(
            "/v0/auth/app/verify/",
            {"pending_token": pending, "curator_code": "123456"},
            format="json",
        )
        self.assertEqual(verify.status_code, 200, verify.data)
        self.assertIn("access", verify.data)
        self.assertEqual(verify.data["group_name"], "ИС-22")

    def test_register_blocked_from_panel_origin(self):
        resp = self.client.post(
            "/v0/auth/app/register/",
            {"email": "panel-reg@test.by", "password": "GoodPass123!", "password_confirm": "GoodPass123!"},
            format="json",
            HTTP_ORIGIN="https://panel.mini-kbp.site",
        )
        self.assertEqual(resp.status_code, 403)

    def test_register_resend_when_email_unverified(self):
        email = "retry@test.by"
        first = self.client.post(
            "/v0/auth/app/register/",
            {"email": email, "password": "GoodPass123!", "password_confirm": "GoodPass123!"},
            format="json",
        )
        self.assertEqual(first.status_code, 200, first.data)

        second = self.client.post(
            "/v0/auth/app/register/",
            {"email": email, "password": "NewPass456!", "password_confirm": "NewPass456!"},
            format="json",
        )
        self.assertEqual(second.status_code, 200, second.data)
        self.assertTrue(second.data.get("needs_email_verify"))

        from accounts.models import AppAccount

        account = AppAccount.objects.get(email__iexact=email)
        self.assertTrue(account.user.check_password("NewPass456!"))

    def test_register_expired_unverified_is_removed(self):
        from datetime import timedelta

        from accounts.models import AppAccount
        from django.contrib.auth import get_user_model
        from django.utils import timezone

        User = get_user_model()
        user = User.objects.create_user(username="oldreg", email="expired@test.by", password="GoodPass123!")
        account = AppAccount.objects.create(user=user, email="expired@test.by", display_name="Old")
        AppAccount.objects.filter(pk=account.pk).update(
            created_at=timezone.now() - timedelta(seconds=86401)
        )

        reg = self.client.post(
            "/v0/auth/app/register/",
            {
                "email": "expired@test.by",
                "password": "FreshPass123!",
                "password_confirm": "FreshPass123!",
            },
            format="json",
        )
        self.assertEqual(reg.status_code, 200, reg.data)
        self.assertTrue(reg.data.get("needs_email_verify"))
        self.assertEqual(AppAccount.objects.filter(email__iexact="expired@test.by").count(), 1)
        fresh = AppAccount.objects.get(email__iexact="expired@test.by")
        self.assertTrue(fresh.user.check_password("FreshPass123!"))

    def test_telegram_login_returns_pending(self):
        import hashlib
        import hmac
        import os
        import time

        from django.test.utils import override_settings

        token = os.environ.get("TELEGRAM_BOT_TOKEN") or "123456:TEST"
        auth_date = int(time.time())
        payload = {"id": "999888777", "first_name": "Tg", "auth_date": str(auth_date), "username": "tguser"}
        secret = hashlib.sha256(token.encode()).digest()
        check = hmac.new(
            secret,
            "\n".join(f"{k}={v}" for k, v in sorted(payload.items())).encode(),
            hashlib.sha256,
        ).hexdigest()
        payload["hash"] = check

        with override_settings(TELEGRAM_BOT_TOKEN=token):
            os.environ["TELEGRAM_BOT_TOKEN"] = token
            r = self.client.post("/v0/auth/app/telegram/", payload, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIn("pending_token", r.data)

    def test_telegram_mobile_bridge_and_exchange(self):
        import hashlib
        import hmac
        import os
        import time

        from django.test.utils import override_settings

        token = os.environ.get("TELEGRAM_BOT_TOKEN") or "123456:TEST"
        auth_date = int(time.time())
        payload = {"id": "111222333", "first_name": "Mob", "auth_date": str(auth_date), "username": "mobtg"}
        secret = hashlib.sha256(token.encode()).digest()
        check = hmac.new(
            secret,
            "\n".join(f"{k}={v}" for k, v in sorted(payload.items())).encode(),
            hashlib.sha256,
        ).hexdigest()
        payload["hash"] = check

        with override_settings(TELEGRAM_BOT_TOKEN=token):
            os.environ["TELEGRAM_BOT_TOKEN"] = token
            bridge = self.client.post(
                "/v0/auth/app/telegram/",
                {**payload, "mobile_bridge": True},
                format="json",
            )
        self.assertEqual(bridge.status_code, 200, bridge.data)
        code = bridge.data.get("mobile_code")
        self.assertTrue(code)

        exchange = self.client.post("/v0/auth/app/mobile/exchange/", {"code": code}, format="json")
        self.assertEqual(exchange.status_code, 200, exchange.data)
        self.assertIn("pending_token", exchange.data)

        again = self.client.post("/v0/auth/app/mobile/exchange/", {"code": code}, format="json")
        self.assertEqual(again.status_code, 401)

    def test_telegram_bot_link_start_webhook_poll(self):
        import os
        from unittest.mock import patch

        from django.test.utils import override_settings

        token = os.environ.get("TELEGRAM_BOT_TOKEN") or "123456:TEST"
        hook = "test-webhook-secret"
        with override_settings(TELEGRAM_BOT_TOKEN=token), patch.dict(
            os.environ,
            {
                "TELEGRAM_BOT_TOKEN": token,
                "NEXT_PUBLIC_TELEGRAM_BOT_USERNAME": "mini_kbp_bot",
                "TELEGRAM_WEBHOOK_SECRET": hook,
            },
            clear=False,
        ):
            start = self.client.post("/v0/auth/app/telegram/link/start/", {}, format="json")
            self.assertEqual(start.status_code, 200, start.data)
            link_token = start.data.get("token")
            self.assertTrue(link_token)

            pending = self.client.get(f"/v0/auth/app/telegram/link/poll/?token={link_token}")
            self.assertEqual(pending.status_code, 200)
            self.assertEqual(pending.data.get("status"), "pending")

            webhook = self.client.post(
                "/v0/telegram/webhook/",
                {
                    "message": {
                        "message_id": 1,
                        "from": {"id": 42424242, "first_name": "Bot", "username": "linkuser"},
                        "chat": {"id": 42424242, "type": "private"},
                        "text": f"/start {link_token}",
                    }
                },
                format="json",
                HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN=hook,
            )
            self.assertEqual(webhook.status_code, 200)

            done = self.client.get(f"/v0/auth/app/telegram/link/poll/?token={link_token}")
            self.assertEqual(done.status_code, 200, done.data)
            self.assertIn("pending_token", done.data)

            expired = self.client.get(f"/v0/auth/app/telegram/link/poll/?token={link_token}")
            self.assertEqual(expired.status_code, 404)

    def test_admin_login_skips_verify(self):
        User.objects.create_user(
            username="superadmin",
            email="admin@test.by",
            password="AdminPass123!",
            is_staff=True,
            is_superuser=True,
        )
        login = self.client.post(
            "/v0/auth/app/login/",
            {"email": "admin@test.by", "password": "AdminPass123!"},
            format="json",
        )
        self.assertEqual(login.status_code, 200)
        self.assertTrue(login.data.get("skip_verify"))
        self.assertEqual(login.data.get("role"), "admin")
        self.assertIn("access", login.data)

    def test_login_email_then_verify(self):
        from django.utils import timezone

        User.objects.create_user(username="u1", email="a@test.by", password="GoodPass123!")
        from accounts.models import AppAccount

        AppAccount.objects.create(
            user=User.objects.get(username="u1"),
            email="a@test.by",
            display_name="Test",
            email_verified_at=timezone.now(),
        )
        login = self.client.post(
            "/v0/auth/app/login/",
            {"email": "a@test.by", "password": "GoodPass123!"},
            format="json",
        )
        self.assertEqual(login.status_code, 200)
        verify = self.client.post(
            "/v0/auth/app/verify/",
            {"pending_token": login.data["pending_token"], "curator_code": "123456"},
            format="json",
        )
        self.assertEqual(verify.status_code, 200)

    def test_returning_student_skips_verify(self):
        data = self._verify_registration_email("back@test.by")
        verify = self.client.post(
            "/v0/auth/app/verify/",
            {"pending_token": data["pending_token"], "curator_code": "123456"},
            format="json",
        )
        self.assertEqual(verify.status_code, 200)

        login = self.client.post(
            "/v0/auth/app/login/",
            {"email": "back@test.by", "password": "GoodPass123!"},
            format="json",
        )
        self.assertEqual(login.status_code, 200)
        self.assertTrue(login.data.get("skip_verify"))
        self.assertEqual(login.data.get("role"), "student")
        self.assertIn("access", login.data)
        self.assertNotIn("pending_token", login.data)

    def test_login_with_2fa_requires_totp(self):
        import pyotp
        from django.utils import timezone
        from accounts.models import AppAccount, Student

        user = User.objects.create_user(username="twofa", email="2fa@test.by", password="GoodPass123!")
        student = Student.objects.create(
            full_name="Two FA",
            record_book_number="2FA-1",
            email="2fa@test.by",
            user=user,
            is_active=True,
        )
        secret = pyotp.random_base32()
        AppAccount.objects.create(
            user=user,
            email="2fa@test.by",
            display_name="Two FA",
            email_verified_at=timezone.now(),
            student=student,
            group=self.group,
            group_verified_at=timezone.now(),
            two_fa_enabled=True,
            two_fa_secret=secret,
        )

        login = self.client.post(
            "/v0/auth/app/login/",
            {"email": "2fa@test.by", "password": "GoodPass123!"},
            format="json",
        )
        self.assertEqual(login.status_code, 200)
        self.assertTrue(login.data.get("needs_2fa"))
        self.assertFalse(login.data.get("needs_curator_code"))

        bad = self.client.post(
            "/v0/auth/app/2fa/",
            {"pending_token": login.data["pending_token"], "totp_code": "000000"},
            format="json",
        )
        self.assertEqual(bad.status_code, 403)

        ok = self.client.post(
            "/v0/auth/app/2fa/",
            {"pending_token": login.data["pending_token"], "totp_code": pyotp.TOTP(secret).now()},
            format="json",
        )
        self.assertEqual(ok.status_code, 200)
        self.assertIn("access", ok.data)
        self.assertEqual(ok.data.get("role"), "student")


class AppAccountListTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        from accounts.models import AppAccount

        self.staff = User.objects.create_user(
            username="stafflist",
            email="staff@test.by",
            password="AdminPass123!",
            is_staff=True,
        )
        email_user = User.objects.create_user(username="emailuser", email="emailuser@test.by", password="GoodPass123!")
        tg_user = User.objects.create_user(username="tguser", password="GoodPass123!")
        AppAccount.objects.create(user=email_user, email="emailuser@test.by", display_name="Email User")
        AppAccount.objects.create(
            user=tg_user,
            telegram_id=123456789,
            telegram_username="tg_user",
            display_name="TG User",
        )
        login = self.client.post(
            "/v0/auth/admin-login/",
            {"username": "stafflist", "password": "AdminPass123!"},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

    def test_list_includes_auth_provider(self):
        resp = self.client.get("/v0/app-accounts/")
        self.assertEqual(resp.status_code, 200)
        by_email = next(r for r in resp.data if r["email"] == "emailuser@test.by")
        by_tg = next(r for r in resp.data if r["label"] == "TG User")
        self.assertEqual(by_email["auth_provider"], "email")
        self.assertEqual(by_tg["auth_provider"], "telegram")
        self.assertEqual(by_tg["telegram_username"], "tg_user")
        self.assertIn("avatar_url", by_email)
        self.assertIn("is_active", by_email)

    def test_patch_deactivates_account(self):
        from accounts.models import AppAccount

        acc = AppAccount.objects.get(email="emailuser@test.by")
        resp = self.client.patch(
            f"/v0/app-accounts/{acc.id}/",
            {
                "is_active": False,
                "display_name": "Updated Name",
                "info": "Bio text",
                "gender": "male",
                "profile_locked": True,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data["is_active"])
        self.assertEqual(resp.data["display_name"], "Updated Name")
        self.assertEqual(resp.data["info"], "Bio text")
        self.assertEqual(resp.data["gender"], "male")
        self.assertTrue(resp.data["profile_locked"])
        acc.refresh_from_db()
        acc.user.refresh_from_db()
        self.assertFalse(acc.user.is_active)
        self.assertEqual(acc.display_name, "Updated Name")
        self.assertEqual(acc.info, "Bio text")
        self.assertTrue(acc.profile_locked)

    def test_push_notify_requires_android_device(self):
        from accounts.models import AppAccount, PushDevice

        acc = AppAccount.objects.get(email="emailuser@test.by")
        with override_settings(FIREBASE_SERVICE_ACCOUNT_JSON='{"project_id":"x"}'):
            resp = self.client.post(
                f"/v0/app-accounts/{acc.id}/push/",
                {"body": "Привет"},
                format="json",
            )
        self.assertEqual(resp.status_code, 404)

        PushDevice.objects.create(
            account=acc,
            device_id="dev-test-1",
            fcm_token="token-abc",
            platform="android",
            kbp_group_id="1",
            group_name="Test",
            active=True,
        )

        with override_settings(FIREBASE_SERVICE_ACCOUNT_JSON='{"project_id":"x"}'):
            with patch("accounts.admin_views.send_fcm_messages", return_value=(1, 0)):
                ok = self.client.post(
                    f"/v0/app-accounts/{acc.id}/push/",
                    {"body": "Тестовое уведомление"},
                    format="json",
                )
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok.data.get("sent"), 1)
        list_resp = self.client.get("/v0/app-accounts/")
        row = next(item for item in list_resp.data if item["email"] == "emailuser@test.by")
        self.assertTrue(row["has_android_push"])
        self.assertEqual(row["android_push_count"], 1)

    def test_admin_can_delete_app_account(self):
        from accounts.models import AppAccount

        acc = AppAccount.objects.get(email="emailuser@test.by")
        resp = self.client.delete(f"/v0/app-accounts/{acc.id}/")
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(AppAccount.objects.filter(id=acc.id).exists())

    def test_admin_cannot_delete_self(self):
        from accounts.models import AppAccount

        own = AppAccount.objects.create(user=self.staff, email="staff@test.by", display_name="Staff")
        resp = self.client.delete(f"/v0/app-accounts/{own.id}/")
        self.assertEqual(resp.status_code, 400)
        self.assertTrue(AppAccount.objects.filter(id=own.id).exists())


class AppProfileTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="prof1", email="old@test.by", password="GoodPass123!")
        from accounts.models import AppAccount

        self.account = AppAccount.objects.create(user=self.user, email="old@test.by", display_name="User")
        self.client.force_authenticate(user=self.user)

    def test_patch_rejects_direct_email_change(self):
        resp = self.client.patch("/v0/app/profile/", {"email": "new@test.by"}, format="json")
        self.assertEqual(resp.status_code, 400)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_email_change_with_code(self):
        from django.core import mail

        req = self.client.post("/v0/app/profile/email/request/", {"email": "new@test.by"}, format="json")
        self.assertEqual(req.status_code, 200, req.data)
        self.assertEqual(len(mail.outbox), 1)
        body = mail.outbox[0].body
        import re

        match = re.search(r"(\d{6})", body)
        self.assertIsNotNone(match)
        code = match.group(1)

        bad = self.client.post("/v0/app/profile/email/confirm/", {"code": "000000"}, format="json")
        self.assertEqual(bad.status_code, 400)

        ok = self.client.post("/v0/app/profile/email/confirm/", {"code": code}, format="json")
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok.data["email"], "new@test.by")
        self.account.refresh_from_db()
        self.assertEqual(self.account.email, "new@test.by")

    def test_two_fa_enable_disable(self):
        import pyotp

        setup = self.client.post("/v0/app/profile/2fa/setup/", format="json")
        self.assertEqual(setup.status_code, 200)
        secret = setup.data["secret"]
        totp = pyotp.TOTP(secret)
        code = totp.now()

        enable = self.client.post("/v0/app/profile/2fa/enable/", {"totp_code": code}, format="json")
        self.assertEqual(enable.status_code, 200)
        self.assertTrue(enable.data["two_fa_enabled"])

        disable = self.client.post("/v0/app/profile/2fa/disable/", {"totp_code": totp.now()}, format="json")
        self.assertEqual(disable.status_code, 200)
        self.assertFalse(disable.data["two_fa_enabled"])

    def test_delete_own_account_requires_email_and_password(self):
        from accounts.models import AppAccount

        missing = self.client.post("/v0/app/profile/delete/", {}, format="json")
        self.assertEqual(missing.status_code, 400)

        wrong = self.client.post(
            "/v0/app/profile/delete/",
            {"confirm_email": "old@test.by", "password": "nope"},
            format="json",
        )
        self.assertEqual(wrong.status_code, 400)

        ok = self.client.post(
            "/v0/app/profile/delete/",
            {"confirm_email": "old@test.by", "password": "GoodPass123!"},
            format="json",
        )
        self.assertEqual(ok.status_code, 204)
        self.assertFalse(AppAccount.objects.filter(pk=self.account.pk).exists())
        self.assertFalse(User.objects.filter(pk=self.user.pk).exists())

    def test_delete_own_account_unlinks_student_and_requires_2fa(self):
        import pyotp
        from accounts.models import AppAccount, Student

        student = Student.objects.create(full_name="Студент Тест", record_book_number="DEL-OWN-1")
        self.account.student = student
        secret = pyotp.random_base32()
        self.account.two_fa_enabled = True
        self.account.two_fa_secret = secret
        self.account.save(update_fields=["student", "two_fa_enabled", "two_fa_secret"])

        no_totp = self.client.post(
            "/v0/app/profile/delete/",
            {"confirm_email": "old@test.by", "password": "GoodPass123!"},
            format="json",
        )
        self.assertEqual(no_totp.status_code, 400)

        ok = self.client.post(
            "/v0/app/profile/delete/",
            {
                "confirm_email": "  OLD@test.by ",
                "password": "GoodPass123!",
                "totp_code": pyotp.TOTP(secret).now(),
            },
            format="json",
        )
        self.assertEqual(ok.status_code, 204)
        student.refresh_from_db()
        self.assertIsNone(student.user_id)
        self.assertFalse(AppAccount.objects.filter(pk=self.account.pk).exists())
        self.assertTrue(Student.objects.filter(pk=student.pk).exists())

    def test_staff_cannot_delete_own_account_from_profile(self):
        self.user.is_staff = True
        self.user.save(update_fields=["is_staff"])
        resp = self.client.post(
            "/v0/app/profile/delete/",
            {"confirm_email": "old@test.by", "password": "GoodPass123!"},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

    def test_patch_rejects_garbage_display_name_and_phone(self):
        bad_name = self.client.patch(
            "/v0/app/profile/",
            {"display_name": "<script>alert(1)</script>"},
            format="json",
        )
        self.assertEqual(bad_name.status_code, 400)

        bad_phone = self.client.patch(
            "/v0/app/profile/",
            {"phone": "not-a-phone-!!!abc"},
            format="json",
        )
        self.assertEqual(bad_phone.status_code, 400)

        ok = self.client.patch(
            "/v0/app/profile/",
            {"display_name": "Иванов Иван", "phone": "+375291112233", "info": "Студент группы ИС-22"},
            format="json",
        )
        self.assertEqual(ok.status_code, 200, ok.data)
        self.assertEqual(ok.data["display_name"], "Иванов Иван")

    def test_patch_rejects_non_image_avatar(self):
        svg = self.client.patch(
            "/v0/app/profile/",
            {"avatar_url": "data:image/svg+xml;base64,PHN2Zy8+"},
            format="json",
        )
        self.assertEqual(svg.status_code, 400)

        html = self.client.patch(
            "/v0/app/profile/",
            {"avatar_url": "data:text/html;base64,PGgxPmhpPC9oMT4="},
            format="json",
        )
        self.assertEqual(html.status_code, 400)

        png = (
            "data:image/png;base64,"
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
        )
        ok = self.client.patch("/v0/app/profile/", {"avatar_url": png}, format="json")
        self.assertEqual(ok.status_code, 200, ok.data)

    def test_email_account_can_link_telegram(self):
        import os
        from unittest.mock import patch

        from accounts.models import AppAccount

        env = {
            "TELEGRAM_WEBHOOK_SECRET": "hook-secret",
            "TELEGRAM_BOT_TOKEN": "123456:TEST",
            "NEXT_PUBLIC_TELEGRAM_BOT_USERNAME": "mini_kbp_bot",
        }
        with patch.dict(os.environ, env, clear=False):
            start = self.client.post("/v0/auth/app/telegram/link/start/", {}, format="json")
            self.assertEqual(start.status_code, 200, start.data)
            link_token = start.data["token"]

            webhook = self.client.post(
                "/v0/telegram/webhook/",
                {
                    "message": {
                        "message_id": 9,
                        "from": {"id": 777001, "first_name": "Mail", "username": "mailuser"},
                        "chat": {"id": 777001, "type": "private"},
                        "text": f"/start {link_token}",
                    }
                },
                format="json",
                HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN="hook-secret",
            )
            self.assertEqual(webhook.status_code, 200, webhook.data)

        self.account.refresh_from_db()
        self.assertEqual(self.account.telegram_id, 777001)
        self.assertEqual(self.account.telegram_username, "mailuser")
        self.assertEqual(AppAccount.objects.filter(telegram_id=777001).count(), 1)

        poll = self.client.get(f"/v0/auth/app/telegram/link/poll/?token={link_token}")
        self.assertEqual(poll.status_code, 200, poll.data)
        self.assertTrue(poll.data.get("linked"))


class KbpProxyTests(TestCase):
    def setUp(self):
        from unittest.mock import patch
        self._dns = patch(
            "accounts.kbp_proxy_views._resolve_kbp_ipv4",
            return_value="93.125.99.137",
        )
        self._dns.start()
        self.addCleanup(self._dns.stop)

    def test_rejects_non_kbp_url(self):
        from rest_framework.test import APIClient

        client = APIClient()
        resp = client.post(
            "/v0/kbp/proxy/",
            {"url": "https://example.com/", "method": "GET"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_accepts_kbp_url_shape(self):
        from unittest.mock import patch
        from rest_framework.test import APIClient

        client = APIClient()
        with patch("accounts.kbp_proxy_views.requests.Session.request") as mock_req:
            mock_resp = mock_req.return_value
            mock_resp.status_code = 200
            mock_resp.headers = {"Content-Type": "text/html"}
            mock_resp.text = "<html></html>"
            resp = client.post(
                "/v0/kbp/proxy/",
                {"url": "https://kbp.by/rasp/timetable/view_beta_kbp/?q=", "method": "GET"},
                format="json",
            )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], 200)
        self.assertIn("<html>", resp.data["data"])
        self.assertTrue(mock_req.called)
        self.assertEqual(mock_req.call_args.kwargs.get("allow_redirects"), False)
        req_args = mock_req.call_args.args
        called_url = req_args[2] if len(req_args) >= 3 else req_args[1]
        self.assertIn("93.125.99.137", called_url)

    def test_follows_safe_kbp_redirects(self):
        from unittest.mock import patch
        from rest_framework.test import APIClient

        client = APIClient()
        redirect = type("R", (), {})()
        redirect.status_code = 301
        redirect.headers = {"Location": "https://kbp.by/rasp/timetable/view_beta_kbp/?q="}
        redirect.text = ""
        final = type("R", (), {})()
        final.status_code = 200
        final.headers = {"Content-Type": "text/html"}
        final.text = "<html>ok</html>"

        with patch("accounts.kbp_proxy_views.requests.Session.request") as mock_req:
            mock_req.side_effect = [redirect, final]
            resp = client.post(
                "/v0/kbp/proxy/",
                {"url": "https://kbp.by/rasp", "method": "GET"},
                format="json",
            )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], 200)
        self.assertIn("ok", resp.data["data"])
        self.assertEqual(mock_req.call_count, 2)
        # Session.request(self, method, url, ...)
        second_args = mock_req.call_args_list[1].args
        second_url = second_args[2] if len(second_args) >= 3 else second_args[1]
        self.assertEqual(
            second_url,
            "https://93.125.99.137/rasp/timetable/view_beta_kbp/?q=",
        )

    def test_rejects_redirect_off_kbp(self):
        from unittest.mock import patch
        from rest_framework.test import APIClient

        client = APIClient()
        redirect = type("R", (), {})()
        redirect.status_code = 302
        redirect.headers = {"Location": "https://evil.example/"}
        redirect.text = ""

        with patch("accounts.kbp_proxy_views.requests.Session.request") as mock_req:
            mock_req.return_value = redirect
            resp = client.post(
                "/v0/kbp/proxy/",
                {"url": "https://kbp.by/rasp", "method": "GET"},
                format="json",
            )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("URL", str(resp.data.get("detail", "")))

    def test_rejects_kbp_lookalike_host(self):
        from rest_framework.test import APIClient

        client = APIClient()
        resp = client.post(
            "/v0/kbp/proxy/",
            {"url": "https://kbp.by.evil.example/", "method": "GET"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_strips_cookie_header_and_set_cookie(self):
        from unittest.mock import patch
        from rest_framework.test import APIClient

        client = APIClient()
        with patch("accounts.kbp_proxy_views.requests.Session.request") as mock_req:
            mock_resp = mock_req.return_value
            mock_resp.status_code = 200
            mock_resp.headers = {"Set-Cookie": "sid=abc", "Content-Type": "text/html"}
            mock_resp.text = "ok"
            resp = client.post(
                "/v0/kbp/proxy/",
                {
                    "url": "https://kbp.by/",
                    "method": "GET",
                    "headers": {"Cookie": "secret=1", "Authorization": "Bearer x"},
                },
                format="json",
            )
        self.assertEqual(resp.status_code, 200)
        forwarded = mock_req.call_args.kwargs["headers"]
        self.assertNotIn("Cookie", forwarded)
        self.assertNotIn("Authorization", forwarded)
        self.assertNotIn("Set-Cookie", resp.data["headers"])

    def test_upstream_error_is_generic(self):
        from unittest.mock import patch
        from rest_framework.test import APIClient
        import requests

        client = APIClient()
        with patch("accounts.kbp_proxy_views.requests.Session.request") as mock_req:
            mock_req.side_effect = requests.RequestException("http://169.254.169.254/secret")
            resp = client.post(
                "/v0/kbp/proxy/",
                {"url": "https://kbp.by/", "method": "GET"},
                format="json",
            )
        self.assertEqual(resp.status_code, 503)
        self.assertNotIn("169.254", str(resp.data))
        self.assertEqual(mock_req.call_count, 1)

    def test_retries_retryable_upstream_errors(self):
        from unittest.mock import patch
        from rest_framework.test import APIClient
        import requests

        client = APIClient()
        ok = type("R", (), {})()
        ok.status_code = 200
        ok.headers = {"Content-Type": "text/html"}
        ok.text = "<html>ok</html>"

        with patch("accounts.kbp_proxy_views.requests.Session.request") as mock_req:
            mock_req.side_effect = [
                requests.Timeout("timed out"),
                requests.ConnectionError("Network is unreachable"),
                ok,
            ]
            with patch("accounts.kbp_proxy_views.time.sleep"):
                resp = client.post(
                    "/v0/kbp/proxy/",
                    {"url": "https://kbp.by/", "method": "GET"},
                    format="json",
                )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], 200)
        self.assertEqual(mock_req.call_count, 3)

    def test_forces_ipv4_gai_family(self):
        import socket
        from accounts import kbp_proxy_views

        self.assertEqual(kbp_proxy_views.urllib3_connection.allowed_gai_family(), socket.AF_INET)
