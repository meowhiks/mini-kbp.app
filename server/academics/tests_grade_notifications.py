from django.test import TestCase
from unittest.mock import patch

from django.contrib.auth import get_user_model

from accounts.models import AppAccount, PushDevice, Student
from academics.grade_notifications import format_grade_push, format_replacement_push, notify_grade_changed
from academics.models import Grade, Group, Subject, TeachingAssignment
from accounts.models import Teacher

User = get_user_model()


class PushCopyTests(TestCase):
    def test_grade_copy(self):
        title, body = format_grade_push(subject="Математика", marks="9")
        self.assertEqual(title, "Математика")
        self.assertEqual(body, "У вас новые отметки : 9")

    def test_replacement_copy(self):
        title, body = format_replacement_push(pair_number=2, new_name="Химия", old_name="Физика")
        self.assertEqual(title, "Замена 2 урока!")
        self.assertEqual(body, "Химия вместо Физика")


class GradeFcmTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="st1", password="GoodPass123!")
        self.student = Student.objects.create(user=self.user, full_name="Студент Тест", record_book_number="RB-1")
        self.account = AppAccount.objects.create(user=self.user, email="st1@test.by", student=self.student)
        PushDevice.objects.create(
            account=self.account,
            device_id="dev-1",
            fcm_token="tok-1",
            platform="android",
            kbp_group_id="1",
            group_name="ИС",
            notify_journal=True,
            active=True,
        )
        group = Group.objects.create(name="ИС-99")
        subject = Subject.objects.create(name="История")
        teacher_user = User.objects.create_user(username="t1", password="GoodPass123!")
        teacher = Teacher.objects.create(user=teacher_user, full_name="Учитель")
        assignment = TeachingAssignment.objects.create(group=group, subject=subject, teacher=teacher)
        from datetime import date

        self.grade = Grade.objects.create(student=self.student, assignment=assignment, date=date.today(), value="8")

    def test_sends_fcm_on_new_grade(self):
        with patch("academics.grade_notifications.send_telegram_message"):
            with patch("academics.grade_notifications.send_grade_change_email"):
                with patch("accounts.fcm_push.fcm_configured", return_value=True):
                    with patch("accounts.fcm_push.send_fcm_messages", return_value=(1, 0)) as send:
                        notify_grade_changed(grade=self.grade, old_value=None)
        send.assert_called_once()
        kwargs = send.call_args.kwargs
        self.assertEqual(kwargs["title"], "История")
        self.assertEqual(kwargs["body"], "У вас новые отметки : 8")
        self.assertEqual(kwargs["source"], "journal")
