"""Тесты hardening: batch enroll, backup/restore, rate limit."""

from __future__ import annotations

import pyotp
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import AppAccount, Student, Teacher
from academics.journal_backup import create_daily_backup, export_journal_payload, restore_journal_from_payload
from academics.models import (
    Grade,
    Group,
    JournalBackup,
    Subject,
    TeachingAssignment,
    Enrollment,
)

User = get_user_model()


class EnrollmentBatchTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        staff = User.objects.create_user(username="batchadmin", password="AdminPass1!", is_staff=True)
        Teacher.objects.create(user=staff, full_name="Batch Admin")
        login = self.client.post(
            "/v0/auth/admin-login/",
            {"username": "batchadmin", "password": "AdminPass1!"},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
        self.group = Group.objects.create(name="ИС-BATCH")
        self.s1 = Student.objects.create(full_name="Студент 1", record_book_number="ЗК-B1")
        self.s2 = Student.objects.create(full_name="Студент 2", record_book_number="ЗК-B2")
        self.inactive = Student.objects.create(
            full_name="Неактивный", record_book_number="ЗК-BX", is_active=False
        )

    def test_batch_enroll_validates_students(self):
        resp = self.client.post(
            "/v0/enrollments/batch/",
            {"group": self.group.id, "student_ids": [self.s1.id, self.s2.id, 99999, "bad", self.inactive.id]},
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["created"], 2)
        self.assertEqual(resp.data["skipped"], 3)
        self.assertEqual(Enrollment.objects.filter(group=self.group, is_active=True).count(), 2)

    def test_batch_reactivates_enrollment(self):
        Enrollment.objects.create(student=self.s1, group=self.group, is_active=False)
        resp = self.client.post(
            "/v0/enrollments/batch/",
            {"group": self.group.id, "student_ids": [self.s1.id]},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["reactivated"], 1)
        self.assertTrue(Enrollment.objects.get(student=self.s1, group=self.group).is_active)


class JournalBackupRestoreTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        staff = User.objects.create_user(username="backupadmin", password="AdminPass1!", is_staff=True)
        self.teacher = Teacher.objects.create(user=staff, full_name="Backup Admin")
        self.group = Group.objects.create(name="ИС-BKP")
        self.subject = Subject.objects.create(name="Math")
        self.student = Student.objects.create(full_name="S BKP", record_book_number="ЗК-BKP")
        self.assignment = TeachingAssignment.objects.create(
            teacher=self.teacher,
            group=self.group,
            subject=self.subject,
        )
        Grade.objects.create(
            assignment=self.assignment,
            student=self.student,
            date="2026-05-01",
            value="7",
        )
        login = self.client.post(
            "/v0/auth/admin-login/",
            {"username": "backupadmin", "password": "AdminPass1!"},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

    def test_export_and_restore_roundtrip(self):
        payload = export_journal_payload()
        self.assertEqual(len(payload["grades"]), 1)
        Grade.objects.all().delete()
        self.assertEqual(Grade.objects.count(), 0)
        stats = restore_journal_from_payload(payload)
        self.assertEqual(stats["grades"], 1)
        self.assertEqual(Grade.objects.count(), 1)
        self.assertEqual(Grade.objects.first().value, "7")

    def test_create_daily_backup(self):
        obj = create_daily_backup(force=True)
        self.assertIsNotNone(obj)
        self.assertGreater(obj.compressed_bytes, 0)
        self.assertEqual(JournalBackup.objects.count(), 1)


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "restore-rate-test",
        }
    },
)
class JournalRestoreRateLimitTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        staff = User.objects.create_user(username="restoreadmin", password="AdminPass1!", is_staff=True)
        Teacher.objects.create(user=staff, full_name="Restore Admin")
        secret = pyotp.random_base32()
        AppAccount.objects.create(
            user=staff,
            email="restore@test.by",
            two_fa_enabled=True,
            two_fa_secret=secret,
        )
        self.totp_secret = secret
        login = self.client.post(
            "/v0/auth/admin-login/",
            {"username": "restoreadmin", "password": "AdminPass1!"},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
        backup = create_daily_backup(force=True)
        self.backup_id = backup.id

    def test_restore_confirm_rate_limits_failures(self):
        req = self.client.post(f"/v0/journal-backups/{self.backup_id}/restore-request/", {}, format="json")
        self.assertEqual(req.status_code, 200, req.data)
        token = req.data["pending_token"]

        for _ in range(5):
            resp = self.client.post(
                f"/v0/journal-backups/{self.backup_id}/restore-confirm/",
                {"pending_token": token, "email_code": "000000", "totp_code": "000000"},
                format="json",
            )
            self.assertEqual(resp.status_code, 403)

        blocked = self.client.post(
            f"/v0/journal-backups/{self.backup_id}/restore-confirm/",
            {"pending_token": token, "email_code": "000000", "totp_code": "000000"},
            format="json",
        )
        self.assertEqual(blocked.status_code, 429)
