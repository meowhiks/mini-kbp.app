"""Обмен cookie-сессии ЛК на JWT для panel.mini-kbp.site."""

from django.contrib.auth import get_user_model
from django.test import RequestFactory, TestCase, override_settings
from rest_framework.test import APIClient

from accounts.app_sessions import SESSION_COOKIE, create_app_session
from accounts.models import AppAccount, Teacher

User = get_user_model()


@override_settings(APP_COOKIE_DOMAIN="")
class CookieSessionViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.factory = RequestFactory()
        self.user = User.objects.create_user(
            username="paneladmin",
            email="paneladmin@test.by",
            password="AdminPass123!",
            is_staff=True,
            is_superuser=True,
        )
        self.account = AppAccount.objects.create(
            user=self.user,
            email="paneladmin@test.by",
            display_name="Panel Admin",
        )

    def test_without_cookie_returns_403(self):
        resp = self.client.post("/v0/auth/cookie-session/", {}, format="json")
        self.assertEqual(resp.status_code, 403)

    def test_student_cookie_returns_403(self):
        from django.utils import timezone
        from academics.models import Group
        from accounts.models import Student

        group = Group.objects.create(name="ИС-99")
        user = User.objects.create_user(username="panelstudent", password="StudentPass1!")
        student = Student.objects.create(
            full_name="Студент Панель",
            record_book_number="ПН-1",
            email="student@test.by",
            user=user,
            is_active=True,
        )
        account = AppAccount.objects.create(
            user=user,
            email="student@test.by",
            display_name="S",
            student=student,
            group=group,
            group_verified_at=timezone.now(),
        )
        session = create_app_session(account, self.factory.post("/v0/auth/cookie-session/"))
        self.client.cookies[SESSION_COOKIE] = session._raw_key
        resp = self.client.post("/v0/auth/cookie-session/", {}, format="json")
        self.assertEqual(resp.status_code, 403, resp.data)

    def test_staff_cookie_returns_jwt(self):
        session = create_app_session(self.account, self.factory.post("/v0/auth/cookie-session/"))
        self.client.cookies[SESSION_COOKIE] = session._raw_key
        resp = self.client.post("/v0/auth/cookie-session/", {}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data.get("role"), "admin")
        self.assertTrue(resp.data.get("skip_verify"))
        self.assertIn("access", resp.data)
        self.assertIn("refresh", resp.data)
        self.assertIn("minikbp_access", resp.cookies)
        self.assertIn("minikbp_refresh", resp.cookies)

    def test_access_cookie_authenticates_without_authorization_header(self):
        session = create_app_session(self.account, self.factory.post("/v0/auth/cookie-session/"))
        self.client.cookies[SESSION_COOKIE] = session._raw_key
        issued = self.client.post("/v0/auth/cookie-session/", {}, format="json")
        self.assertEqual(issued.status_code, 200, issued.data)
        access = issued.cookies["minikbp_access"].value
        self.client.credentials()
        self.client.cookies.clear()
        self.client.cookies["minikbp_access"] = access
        profile = self.client.get("/v0/app/profile/")
        self.assertEqual(profile.status_code, 200, profile.data)

    def test_teacher_cookie_returns_teacher_role(self):
        user = User.objects.create_user(username="panelteacher", password="TeacherPass1!")
        Teacher.objects.create(user=user, full_name="Учитель Панель", is_active=True)
        account = AppAccount.objects.create(user=user, email="teacher@test.by", display_name="T")
        session = create_app_session(account, self.factory.post("/v0/auth/cookie-session/"))
        self.client.cookies[SESSION_COOKIE] = session._raw_key
        resp = self.client.post("/v0/auth/cookie-session/", {}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data.get("role"), "teacher")
        self.assertIn("access", resp.data)


@override_settings(APP_COOKIE_DOMAIN=".mini-kbp.site")
class LoginSharedCookieTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_admin_login_sets_session_and_jwt_cookies_for_all_subdomains(self):
        User.objects.create_user(
            username="cookiestaff",
            email="cookiestaff@test.by",
            password="AdminPass123!",
            is_staff=True,
            is_superuser=True,
        )
        login = self.client.post(
            "/v0/auth/app/login/",
            {"email": "cookiestaff@test.by", "password": "AdminPass123!"},
            format="json",
        )
        self.assertEqual(login.status_code, 200, login.data)
        for name in ("minikbp_session", "minikbp_passport", "minikbp_access", "minikbp_refresh"):
            self.assertIn(name, login.cookies, name)
            self.assertEqual(login.cookies[name]["domain"], ".mini-kbp.site", name)

    def test_login_cookies_stay_small_when_avatar_is_data_url(self):
        user = User.objects.create_user(
            username="bigavatar",
            email="bigavatar@test.by",
            password="AdminPass123!",
            is_staff=True,
            is_superuser=True,
        )
        from accounts.models import AppAccount

        AppAccount.objects.create(
            user=user,
            email="bigavatar@test.by",
            display_name="Big",
            avatar_url="data:image/png;base64," + ("A" * 20000),
        )
        login = self.client.post(
            "/v0/auth/app/login/",
            {"email": "bigavatar@test.by", "password": "AdminPass123!"},
            format="json",
        )
        self.assertEqual(login.status_code, 200, login.data)
        total = 0
        for name in ("minikbp_session", "minikbp_passport", "minikbp_access", "minikbp_refresh"):
            value = login.cookies[name].value
            self.assertLess(len(value), 4000, name)
            total += len(value)
        self.assertLess(total, 7000)
