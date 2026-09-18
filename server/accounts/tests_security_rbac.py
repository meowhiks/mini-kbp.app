"""Security regression tests from offensive pentest findings."""

from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from accounts.models import AppAccount, Student, Teacher
from academics.models import (
    Enrollment,
    Grade,
    Group,
    JournalDay,
    LatenessRecord,
    Subject,
    TeachingAssignment,
)

User = get_user_model()


class SecurityRbacTests(APITestCase):
    def setUp(self):
        self.group_a = Group.objects.create(name="A")
        self.group_b = Group.objects.create(name="B")
        self.subject = Subject.objects.create(name="Subj", short_name="S")

        self.student_user = User.objects.create_user(username="stu1", password="StuPass123!")
        self.student = Student.objects.create(
            user=self.student_user,
            full_name="Student One",
            record_book_number="S-1",
        )
        Enrollment.objects.create(student=self.student, group=self.group_a)
        AppAccount.objects.create(user=self.student_user, student=self.student, group=self.group_a)

        self.other = Student.objects.create(full_name="Other", record_book_number="S-2")
        Enrollment.objects.create(student=self.other, group=self.group_b)

        self.teacher_user = User.objects.create_user(username="t1", password="TeaPass123!")
        self.teacher = Teacher.objects.create(user=self.teacher_user, full_name="Teacher")
        self.assignment = TeachingAssignment.objects.create(
            teacher=self.teacher, group=self.group_b, subject=self.subject
        )
        Grade.objects.create(
            assignment=self.assignment,
            student=self.other,
            date=date(2026, 8, 1),
            value="5",
        )
        self.hidden_day = JournalDay.objects.create(
            assignment=self.assignment,
            date=date(2026, 8, 1),
            slot=0,
            footer_note="secret-day-note",
        )
        self.hidden_late = LatenessRecord.objects.create(
            group=self.group_b,
            student=self.other,
            date=date(2026, 8, 1),
            slot=0,
            minutes=12,
        )

        self.student_token = str(AccessToken.for_user(self.student_user))

    def test_student_cannot_create_teacher(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.student_token}")
        resp = self.client.post(
            "/v0/teachers/",
            {"username": "hack", "password": "HackPass123!", "full_name": "Hack"},
            format="json",
        )
        self.assertIn(resp.status_code, (403, 401))

    def test_student_cannot_list_teachers(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.student_token}")
        resp = self.client.get("/v0/teachers/")
        self.assertEqual(resp.status_code, 403)

    def test_student_cannot_read_other_grades(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.student_token}")
        resp = self.client.get(f"/v0/grades/?group={self.group_b.id}")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data, [])

    def test_student_cannot_list_other_journal_days(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.student_token}")
        resp = self.client.get("/v0/journal-days/")
        self.assertEqual(resp.status_code, 200)
        ids = [row["id"] for row in resp.data]
        self.assertNotIn(self.hidden_day.id, ids)

    def test_student_cannot_retrieve_other_journal_day(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.student_token}")
        resp = self.client.get(f"/v0/journal-days/{self.hidden_day.id}/")
        self.assertIn(resp.status_code, (403, 404))

    def test_student_cannot_list_other_lateness(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.student_token}")
        resp = self.client.get("/v0/lateness/")
        self.assertEqual(resp.status_code, 200)
        ids = [row["id"] for row in resp.data]
        self.assertNotIn(self.hidden_late.id, ids)
        notes = [row.get("minutes") for row in resp.data]
        self.assertNotIn(12, notes)

    def test_student_cannot_read_other_group_roster(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.student_token}")
        resp = self.client.get(f"/v0/groups/{self.group_b.id}/students/")
        self.assertIn(resp.status_code, (403, 404))

    def test_anon_push_register_denied(self):
        resp = self.client.post(
            "/v0/push/register/",
            {
                "fcmToken": "x",
                "ejGroupId": "1",
                "groupName": "G",
                "deviceId": "d",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 401)

    def test_student_login_gone(self):
        resp = self.client.post(
            "/v0/auth/student-login/",
            {"student_name": "x", "group_id": "1", "birth_day": "01.01.2000"},
            format="json",
        )
        self.assertEqual(resp.status_code, 410)

    def test_public_groups_requires_auth(self):
        self.assertEqual(self.client.get("/v0/public/groups/").status_code, 401)

    def test_telegram_webhook_requires_secret(self):
        resp = self.client.post("/v0/telegram/webhook/", {"message": {}}, format="json")
        self.assertEqual(resp.status_code, 503)
