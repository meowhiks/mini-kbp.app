"""Tests for journal audit API."""

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from academics.journal_audit import log_journal_action
from academics.models import Group, Subject, TeachingAssignment, JournalAuditLog
from accounts.models import Teacher


class JournalAuditTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("t1", password="pass12345")
        self.teacher = Teacher.objects.create(user=self.user, full_name="Teacher One")
        self.group = Group.objects.create(name="G1")
        self.subject = Subject.objects.create(name="Math", short_name="M")
        self.assignment = TeachingAssignment.objects.create(
            teacher=self.teacher,
            group=self.group,
            subject=self.subject,
            lesson_type="lecture",
            hours_per_week=2,
            semester=1,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_log_journal_action_creates_row(self):
        row = log_journal_action(
            assignment=self.assignment,
            actor=self.user,
            action="grade_set",
            payload={"after": "5"},
            client_op_id="op-1",
        )
        self.assertEqual(JournalAuditLog.objects.count(), 1)
        self.assertEqual(row.client_op_id, "op-1")

    def test_audit_list_requires_assignment(self):
        resp = self.client.get("/v0/journal-audit/")
        self.assertEqual(resp.status_code, 400)

    def test_audit_list_returns_items(self):
        log_journal_action(
            assignment=self.assignment,
            actor=self.user,
            action="grade_set",
            payload={"after": "4"},
        )
        resp = self.client.get(f"/v0/journal-audit/?assignment={self.assignment.pk}")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()["items"]), 1)
