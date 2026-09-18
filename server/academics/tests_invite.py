"""Unit-тесты одноразовых кодов-паролей и админских CRUD."""

from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from academics.models import (
    CuratorInviteCode,
    Enrollment,
    Grade,
    Group,
    GroupCurator,
    JournalDay,
    Subject,
    TeachingAssignment,
)
from accounts.models import AppAccount, Student, Teacher

User = get_user_model()


class DemoFixturesMixin:
    """Общие тестовые данные для админки и кодов."""

    @classmethod
    def create_demo(cls):
        group = Group.objects.create(name="ИС-DEMO")
        subject = Subject.objects.create(name="Демо предмет", short_name="ДЕМ")
        admin_user = User.objects.create_user(
            username="demo_admin",
            email="admin@demo.by",
            password="DemoAdmin123!",
            is_staff=True,
        )
        teacher_user = User.objects.create_user(username="demo_teacher", password="DemoTeach123!")
        teacher = Teacher.objects.create(user=teacher_user, full_name="Демо Учитель")
        GroupCurator.objects.create(teacher=teacher, group=group)
        TeachingAssignment.objects.create(teacher=teacher, group=group, subject=subject)
        student = Student.objects.create(
            full_name="Демо Студент",
            record_book_number="DEMO-001",
            birth_date=date(2005, 1, 1),
        )
        Enrollment.objects.create(student=student, group=group)
        day = date(2026, 6, 25)
        assignment = TeachingAssignment.objects.get(teacher=teacher, group=group)
        Grade.objects.create(assignment=assignment, student=student, date=day, value="5")
        JournalDay.objects.create(assignment=assignment, date=day)
        student_code = CuratorInviteCode.objects.create(
            role=CuratorInviteCode.Role.STUDENT,
            group=group,
            code="STUD01",
            expires_at=timezone.now() + timedelta(days=7),
        )
        teacher_code = CuratorInviteCode.objects.create(
            role=CuratorInviteCode.Role.TEACHER,
            code="TEACH1",
            expires_at=timezone.now() + timedelta(days=7),
        )
        return {
            "group": group,
            "admin_user": admin_user,
            "teacher": teacher,
            "student_code": student_code,
            "teacher_code": teacher_code,
        }


class RoleInviteCodeTests(DemoFixturesMixin, TestCase):
    def setUp(self):
        self.client = APIClient()
        demo = self.create_demo()
        self.group = demo["group"]
        self.admin = demo["admin_user"]
        self.teacher = demo["teacher"]
        login = self.client.post(
            "/v0/auth/app/login/",
            {"email": "admin@demo.by", "password": "DemoAdmin123!"},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

    def _verify_registration_email(self, email: str) -> dict:
        import re

        from django.core import mail

        reg = self.client.post(
            "/v0/auth/app/register/",
            {"email": email, "password": "GoodPass123!", "password_confirm": "GoodPass123!"},
            format="json",
        )
        self.assertEqual(reg.status_code, 200, reg.data)
        self.assertTrue(reg.data.get("needs_email_verify"))
        dev_code = reg.data.get("dev_code")
        if not dev_code:
            self.assertGreaterEqual(len(mail.outbox), 1)
            match = re.search(r"(\d{6})", mail.outbox[-1].body)
            self.assertIsNotNone(match)
            dev_code = match.group(1)
        verify_email = self.client.post(
            "/v0/auth/app/verify-email/",
            {"email": email, "code": dev_code},
            format="json",
        )
        self.assertEqual(verify_email.status_code, 200, verify_email.data)
        return verify_email.data

    def test_admin_create_student_code(self):
        resp = self.client.post(
            "/v0/role-invite-codes/",
            {"role": "student", "group_id": self.group.id},
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["role"], "student")
        self.assertEqual(resp.data["max_uses"], 1)
        self.assertTrue(resp.data["is_active"])

    def test_admin_create_teacher_code(self):
        resp = self.client.post(
            "/v0/role-invite-codes/",
            {"role": "teacher"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["role"], "teacher")
        self.assertIsNone(resp.data["group_id"])

    def test_list_and_revoke_code(self):
        created = self.client.post(
            "/v0/role-invite-codes/",
            {"role": "teacher"},
            format="json",
        )
        code_id = created.data["id"]
        listed = self.client.get("/v0/role-invite-codes/")
        self.assertEqual(listed.status_code, 200)
        self.assertTrue(any(r["id"] == code_id for r in listed.data))
        deleted = self.client.delete(f"/v0/role-invite-codes/{code_id}/")
        self.assertEqual(deleted.status_code, 204)
        invite = CuratorInviteCode.objects.get(pk=code_id)
        self.assertFalse(invite.is_active)

    def test_student_code_verify_binds_account(self):
        reg = self._verify_registration_email("newstu@demo.by")
        verify = self.client.post(
            "/v0/auth/app/verify/",
            {"pending_token": reg["pending_token"], "curator_code": "STUD01"},
            format="json",
        )
        self.assertEqual(verify.status_code, 200, verify.data)
        self.assertEqual(verify.data["role"], "student")
        invite = CuratorInviteCode.objects.get(code="STUD01")
        self.assertEqual(invite.use_count, 1)
        self.assertFalse(invite.is_active)
        self.assertIsNotNone(invite.used_by_id)

    def test_teacher_code_verify_creates_profile(self):
        reg = self._verify_registration_email("newteach@demo.by")
        verify = self.client.post(
            "/v0/auth/app/verify/",
            {"pending_token": reg["pending_token"], "curator_code": "TEACH1"},
            format="json",
        )
        self.assertEqual(verify.status_code, 200, verify.data)
        self.assertEqual(verify.data["role"], "teacher")
        account = AppAccount.objects.get(email="newteach@demo.by")
        self.assertTrue(Teacher.objects.filter(user=account.user, is_active=True).exists())

    def test_code_cannot_be_reused(self):
        reg = self._verify_registration_email("once@demo.by")
        first = self.client.post(
            "/v0/auth/app/verify/",
            {"pending_token": reg["pending_token"], "curator_code": "TEACH1"},
            format="json",
        )
        self.assertEqual(first.status_code, 200)
        reg2 = self._verify_registration_email("twice@demo.by")
        second = self.client.post(
            "/v0/auth/app/verify/",
            {"pending_token": reg2["pending_token"], "curator_code": "TEACH1"},
            format="json",
        )
        self.assertEqual(second.status_code, 403)

    def test_curator_creates_code_only_for_own_group(self):
        from rest_framework_simplejwt.tokens import AccessToken

        other = Group.objects.create(name="ЧУЖАЯ")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(self.teacher.user)}")
        own = self.client.post(
            "/v0/role-invite-codes/",
            {"role": "student", "group_id": self.group.id},
            format="json",
        )
        self.assertEqual(own.status_code, 201, own.data)
        foreign = self.client.post(
            "/v0/role-invite-codes/",
            {"role": "student", "group_id": other.id},
            format="json",
        )
        self.assertEqual(foreign.status_code, 403)
        teacher_code = self.client.post("/v0/role-invite-codes/", {"role": "teacher"}, format="json")
        self.assertEqual(teacher_code.status_code, 403)


class AdminCrudTests(DemoFixturesMixin, TestCase):
    def setUp(self):
        self.client = APIClient()
        demo = self.create_demo()
        self.group = demo["group"]
        self.admin = demo["admin_user"]
        login = self.client.post(
            "/v0/auth/admin-login/",
            {"username": "demo_admin", "password": "DemoAdmin123!"},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

    def test_groups_crud(self):
        create = self.client.post("/v0/groups/", {"name": "ИС-NEW"}, format="json")
        self.assertEqual(create.status_code, 201)
        gid = create.data["id"]
        patch = self.client.patch(f"/v0/groups/{gid}/", {"description": "Тест"}, format="json")
        self.assertEqual(patch.status_code, 200)
        delete = self.client.delete(f"/v0/groups/{gid}/")
        self.assertIn(delete.status_code, (204, 200))

    def test_teachers_list_and_delete(self):
        listed = self.client.get("/v0/teachers/")
        self.assertEqual(listed.status_code, 200)
        self.assertGreaterEqual(len(listed.data), 1)
        tid = listed.data[0]["id"]
        deactivated = self.client.patch(f"/v0/teachers/{tid}/", {"is_active": False}, format="json")
        self.assertEqual(deactivated.status_code, 200)

    def test_students_list(self):
        resp = self.client.get("/v0/students/")
        self.assertEqual(resp.status_code, 200)
        self.assertGreaterEqual(len(resp.data), 1)

    def test_delete_student_requires_2fa_and_name(self):
        import pyotp
        from accounts.models import AppAccount, Student

        extra = Student.objects.create(full_name="Удаляемый Студент", record_book_number="DEL-1")
        missing = self.client.delete(f"/v0/students/{extra.id}/")
        self.assertEqual(missing.status_code, 403)

        secret = pyotp.random_base32()
        AppAccount.objects.create(
            user=self.admin,
            email="admin@demo.by",
            display_name="Админ",
            two_fa_enabled=True,
            two_fa_secret=secret,
        )
        wrong_name = self.client.delete(
            f"/v0/students/{extra.id}/",
            {"totp_code": pyotp.TOTP(secret).now(), "confirm_name": "не то"},
            format="json",
        )
        self.assertEqual(wrong_name.status_code, 400)
        ok = self.client.delete(
            f"/v0/students/{extra.id}/",
            {"totp_code": pyotp.TOTP(secret).now(), "confirm_name": f"  {extra.full_name}  "},
            format="json",
        )
        self.assertIn(ok.status_code, (204, 200))
        self.assertFalse(Student.objects.filter(pk=extra.id).exists())

    def test_journal_access_for_admin(self):
        resp = self.client.get("/v0/journal/")
        self.assertEqual(resp.status_code, 200)
        self.assertGreaterEqual(len(resp.data), 1)
