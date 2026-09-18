from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Teacher, StaffSecuritySettings, StaffSessionState
from academics.models import Group, Subject, TeachingAssignment, Grade, JournalAuditLog, Enrollment
from accounts.models import Student

User = get_user_model()


class JournalAuditTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="t1", password="pass12345")
        self.teacher = Teacher.objects.create(user=self.user, full_name="Teacher One")
        self.group = Group.objects.create(name="G1")
        self.subject = Subject.objects.create(name="Math", short_name="M")
        self.student = Student.objects.create(full_name="Stu", record_book_number="RB1")
        Enrollment.objects.create(student=self.student, group=self.group)
        self.assignment = TeachingAssignment.objects.create(
            teacher=self.teacher, group=self.group, subject=self.subject
        )
        self.client.force_authenticate(user=self.user)

    def test_grade_create_writes_audit(self):
        resp = self.client.post(
            "/v0/grades/",
            {"assignment": self.assignment.pk, "student": self.student.pk, "date": "2026-03-01", "value": "5"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(JournalAuditLog.objects.filter(assignment=self.assignment).count(), 1)

    def test_audit_list_scoped_to_teacher(self):
        JournalAuditLog.objects.create(
            assignment=self.assignment,
            actor=self.user,
            action="grade_set",
            payload={"value": "5"},
        )
        resp = self.client.get(f"/v0/journal-audit/?assignment={self.assignment.pk}")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()["items"]), 1)


class JournalSyncTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="t2", password="pass12345")
        self.teacher = Teacher.objects.create(user=self.user, full_name="Teacher Two")
        self.group = Group.objects.create(name="G2")
        self.subject = Subject.objects.create(name="Phys", short_name="P")
        self.student = Student.objects.create(full_name="Stu2", record_book_number="RB2")
        Enrollment.objects.create(student=self.student, group=self.group)
        self.assignment = TeachingAssignment.objects.create(
            teacher=self.teacher, group=self.group, subject=self.subject
        )
        self.client.force_authenticate(user=self.user)

    def test_batch_apply_offline_grade(self):
        resp = self.client.post(
            "/v0/journal-sync/batch/",
            {
                "ops": [
                    {
                        "client_op_id": "op1",
                        "type": "grade_set",
                        "assignment_id": self.assignment.pk,
                        "student_id": self.student.pk,
                        "date": "2026-03-02",
                        "slot": 0,
                        "value": "4",
                    }
                ]
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIn("op1", resp.json()["applied"])
        self.assertTrue(
            Grade.objects.filter(assignment=self.assignment, student=self.student, value="4").exists()
        )

    def test_batch_detects_conflict(self):
        Grade.objects.create(
            assignment=self.assignment,
            student=self.student,
            date="2026-03-03",
            value="3",
        )
        resp = self.client.post(
            "/v0/journal-sync/batch/",
            {
                "ops": [
                    {
                        "client_op_id": "op2",
                        "type": "grade_set",
                        "assignment_id": self.assignment.pk,
                        "student_id": self.student.pk,
                        "date": "2026-03-03",
                        "slot": 0,
                        "value": "5",
                    }
                ]
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()["conflicts"]), 1)


class JournalPresenceTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="t3", password="pass12345")
        self.teacher = Teacher.objects.create(user=self.user, full_name="Teacher Three")
        self.group = Group.objects.create(name="G3")
        self.subject = Subject.objects.create(name="Chem", short_name="C")
        self.assignment = TeachingAssignment.objects.create(
            teacher=self.teacher, group=self.group, subject=self.subject
        )
        self.client.force_authenticate(user=self.user)

    def test_presence_heartbeat(self):
        resp = self.client.post(
            "/v0/journal-presence/heartbeat/",
            {
                "assignment_id": self.assignment.pk,
                "student_id": 1,
                "date": "2026-03-04",
                "slot": 0,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()["ok"])


class StaffLockTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="t4", password="pass12345")
        self.teacher = Teacher.objects.create(user=self.user, full_name="Teacher Four")
        self.client.force_authenticate(user=self.user)

    def test_pin_unlock(self):
        settings = StaffSecuritySettings.objects.create(
            user=self.user,
            pin_hash=__import__("hashlib").sha256(f"{self.user.pk}:1234".encode()).hexdigest(),
            lock_enabled=True,
        )
        state = StaffSessionState.objects.create(user=self.user, locked=True)
        resp = self.client.post("/v0/staff-security/unlock/", {"pin": "1234"}, format="json")
        self.assertEqual(resp.status_code, 200)
        state.refresh_from_db()
        self.assertFalse(state.locked)

    def test_locked_returns_423_on_grade_write(self):
        StaffSecuritySettings.objects.create(user=self.user, lock_enabled=True, idle_lock_minutes=1)
        StaffSessionState.objects.create(user=self.user, locked=True)
        group = Group.objects.create(name="G4")
        subject = Subject.objects.create(name="Bio", short_name="B")
        student = Student.objects.create(full_name="Stu4", record_book_number="RB4")
        Enrollment.objects.create(student=student, group=group)
        assignment = TeachingAssignment.objects.create(teacher=self.teacher, group=group, subject=subject)
        resp = self.client.post(
            "/v0/grades/",
            {"assignment": assignment.pk, "student": student.pk, "date": "2026-03-05", "value": "5"},
            format="json",
        )
        self.assertEqual(resp.status_code, 423)
