"""
Unit-тесты academics/.

Покрывают:
- модели: создание, строковое представление, уникальность,
  запрет дублей назначений.
- API: CRUD групп/предметов/назначений, доп. экшены (students, assignments,
  by-teacher).
"""

from django.test import TestCase
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from rest_framework.test import APIClient

from accounts.models import Teacher, Student
from .models import Group, Subject, Enrollment, TeachingAssignment, Grade

User = get_user_model()


class GroupModelTests(TestCase):
    def test_create(self):
        g = Group.objects.create(name="ИС-21")
        self.assertEqual(str(g), "ИС-21")
        self.assertTrue(g.is_active)

    def test_name_unique(self):
        Group.objects.create(name="ИС-21")
        with self.assertRaises(IntegrityError):
            Group.objects.create(name="ИС-21")


class SubjectModelTests(TestCase):
    def test_create(self):
        s = Subject.objects.create(name="Математика", short_name="МАТ")
        self.assertEqual(str(s), "МАТ")

    def test_str_fallback(self):
        s = Subject.objects.create(name="Физика")
        self.assertEqual(str(s), "Физика")


class EnrollmentModelTests(TestCase):
    def setUp(self):
        self.group = Group.objects.create(name="ИС-21")
        self.student = Student.objects.create(
            full_name="Иванов", record_book_number="ЗК-100"
        )

    def test_create(self):
        e = Enrollment.objects.create(student=self.student, group=self.group)
        self.assertEqual(str(e), "Иванов (ЗК-100) → ИС-21")
        self.assertTrue(e.is_active)

    def test_unique_student_group(self):
        Enrollment.objects.create(student=self.student, group=self.group)
        with self.assertRaises(IntegrityError):
            Enrollment.objects.create(student=self.student, group=self.group)


class TeachingAssignmentModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="t1", password="x1234567!")
        self.teacher = Teacher.objects.create(user=self.user, full_name="Учитель 1")
        self.group = Group.objects.create(name="ИС-21")
        self.subject = Subject.objects.create(name="Математика")

    def test_create(self):
        a = TeachingAssignment.objects.create(
            teacher=self.teacher,
            group=self.group,
            subject=self.subject,
            lesson_type=TeachingAssignment.LessonType.LECTURE,
        )
        self.assertIn("Учитель 1", str(a))
        self.assertIn("ИС-21", str(a))

    def test_unique_assignment(self):
        TeachingAssignment.objects.create(
            teacher=self.teacher,
            group=self.group,
            subject=self.subject,
            lesson_type=TeachingAssignment.LessonType.LECTURE,
        )
        with self.assertRaises(IntegrityError):
            TeachingAssignment.objects.create(
                teacher=self.teacher,
                group=self.group,
                subject=self.subject,
                lesson_type=TeachingAssignment.LessonType.LECTURE,
            )

    def test_same_teacher_different_lesson_type_ok(self):
        TeachingAssignment.objects.create(
            teacher=self.teacher,
            group=self.group,
            subject=self.subject,
            lesson_type=TeachingAssignment.LessonType.LECTURE,
        )
        # Практика того же предмета у того же учителя и группы — ОК
        a2 = TeachingAssignment.objects.create(
            teacher=self.teacher,
            group=self.group,
            subject=self.subject,
            lesson_type=TeachingAssignment.LessonType.PRACTICE,
        )
        self.assertNotEqual(a2.pk, None)


class GradeModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="gt", password="x1234567!")
        self.teacher = Teacher.objects.create(user=self.user, full_name="Учитель G")
        self.group = Group.objects.create(name="ИС-G1")
        self.subject = Subject.objects.create(name="Информатика")
        self.student = Student.objects.create(
            full_name="Студент G", record_book_number="ЗК-G1"
        )
        self.assignment = TeachingAssignment.objects.create(
            teacher=self.teacher,
            group=self.group,
            subject=self.subject,
            lesson_type=TeachingAssignment.LessonType.PRACTICE,
        )

    def test_create_grade(self):
        g = Grade.objects.create(
            assignment=self.assignment,
            student=self.student,
            date="2026-03-01",
            value="5",
        )
        self.assertEqual(str(g), "Студент G (ЗК-G1) / Информатика / 2026-03-01: 5")

    def test_unique_grade_per_slot(self):
        Grade.objects.create(
            assignment=self.assignment,
            student=self.student,
            date="2026-03-01",
            slot=0,
            value="4",
        )
        Grade.objects.create(
            assignment=self.assignment,
            student=self.student,
            date="2026-03-01",
            slot=1,
            value="5",
        )
        with self.assertRaises(IntegrityError):
            Grade.objects.create(
                assignment=self.assignment,
                student=self.student,
                date="2026-03-01",
                slot=0,
                value="3",
            )


class GradeApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user = User.objects.create_user(username="gradeadmin", password="AdminPass1!")
        self.teacher = Teacher.objects.create(user=user, full_name="Grade Admin")
        self.group = Group.objects.create(name="ИС-G2")
        self.subject = Subject.objects.create(name="Физика")
        self.student = Student.objects.create(
            full_name="Студент API", record_book_number="ЗК-G2"
        )
        Enrollment.objects.create(student=self.student, group=self.group)
        self.assignment = TeachingAssignment.objects.create(
            teacher=self.teacher,
            group=self.group,
            subject=self.subject,
        )
        resp = self.client.post(
            "/v0/auth/login/",
            {"username": "gradeadmin", "password": "AdminPass1!"},
            format="json",
        )
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {resp.data['access']}"
        )

    def test_create_and_list_grades(self):
        resp = self.client.post(
            "/v0/grades/",
            {
                "assignment": self.assignment.id,
                "student": self.student.id,
                "date": "2026-04-10",
                "value": "8",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        list_resp = self.client.get(
            f"/v0/grades/?assignment={self.assignment.id}"
        )
        self.assertEqual(list_resp.status_code, 200)
        self.assertEqual(len(list_resp.data), 1)
        self.assertEqual(list_resp.data[0]["value"], "8")

    def test_by_assignment_action(self):
        self.client.post(
            "/v0/grades/",
            {
                "assignment": self.assignment.id,
                "student": self.student.id,
                "date": "2026-04-11",
                "value": "Н",
            },
            format="json",
        )
        resp = self.client.get(
            f"/v0/grades/by-assignment/{self.assignment.id}/"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)

    def test_update_grade(self):
        create = self.client.post(
            "/v0/grades/",
            {
                "assignment": self.assignment.id,
                "student": self.student.id,
                "date": "2026-04-12",
                "value": "6",
            },
            format="json",
        )
        grade_id = create.data["id"]
        patch = self.client.patch(
            f"/v0/grades/{grade_id}/",
            {"value": "7"},
            format="json",
        )
        self.assertEqual(patch.status_code, 200)
        self.assertEqual(patch.data["value"], "7")

    def test_grades_require_auth(self):
        anon = APIClient()
        self.assertEqual(anon.get("/v0/grades/").status_code, 401)


class ApiSmokeTests(TestCase):
    """Базовый smoke-test: создание сущностей через API."""

    def setUp(self):
        self.client = APIClient()
        user = User.objects.create_user(username="admin", password="AdminPass1!")
        Teacher.objects.create(user=user, full_name="Админ")
        resp = self.client.post(
            "/v0/auth/login/",
            {"username": "admin", "password": "AdminPass1!"},
            format="json",
        )
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {resp.data['access']}"
        )

    def test_create_group(self):
        resp = self.client.post(
            "/v0/groups/", {"name": "ИС-21"}, format="json"
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["name"], "ИС-21")

    def test_create_subject(self):
        resp = self.client.post(
            "/v0/subjects/",
            {"name": "Математика", "short_name": "МАТ"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)

    def test_create_teacher_via_api(self):
        resp = self.client.post(
            "/v0/teachers/",
            {
                "username": "t2",
                "password": "NewPass123!",
                "full_name": "Второй",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)

    def test_enroll_student(self):
        group = Group.objects.create(name="ИС-22")
        student = Student.objects.create(
            full_name="Студент", record_book_number="ЗК-200"
        )
        resp = self.client.post(
            "/v0/enrollments/",
            {"student": student.id, "group": group.id},
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)

    def test_assign_teacher_to_group_subject(self):
        t_user = User.objects.create_user(
            username="t3", password="NewPass123!"
        )
        teacher = Teacher.objects.create(user=t_user, full_name="Третий")
        group = Group.objects.create(name="ИС-23")
        subject = Subject.objects.create(name="Физика")
        resp = self.client.post(
            "/v0/assignments/",
            {
                "teacher": teacher.id,
                "group": group.id,
                "subject": subject.id,
                "lesson_type": "lecture",
                "semester": 1,
                "hours_per_week": 4,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)

    def test_list_students_in_group(self):
        g = Group.objects.create(name="ИС-24")
        s = Student.objects.create(full_name="X", record_book_number="ЗК-300")
        Enrollment.objects.create(student=s, group=g)
        resp = self.client.get(f"/v0/groups/{g.id}/students/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["full_name"], "X")

    def test_assignments_by_teacher(self):
        t_user = User.objects.create_user(
            username="t4", password="NewPass123!"
        )
        teacher = Teacher.objects.create(user=t_user, full_name="Четвёртый")
        g = Group.objects.create(name="ИС-25")
        sub = Subject.objects.create(name="Химия")
        TeachingAssignment.objects.create(
            teacher=teacher, group=g, subject=sub,
            lesson_type=TeachingAssignment.LessonType.LAB,
        )
        resp = self.client.get(f"/v0/assignments/by-teacher/{teacher.id}/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)

    def test_endpoints_require_auth(self):
        anon = APIClient()
        for url in [
            "/v0/teachers/",
            "/v0/students/",
            "/v0/groups/",
            "/v0/subjects/",
            "/v0/enrollments/",
            "/v0/assignments/",
            "/v0/grades/",
        ]:
            self.assertEqual(anon.get(url).status_code, 401, url)


class AdminAnalyticsTests(TestCase):
    """GET /api/admin/analytics/ — без FieldError при select_related + only."""

    def setUp(self):
        self.client = APIClient()
        user = User.objects.create_user(username="analyticadmin", password="AdminPass1!", is_staff=True)
        self.teacher = Teacher.objects.create(user=user, full_name="Аналитик")
        self.group = Group.objects.create(name="ИС-AN")
        self.subject = Subject.objects.create(name="Алgebra")
        self.student = Student.objects.create(full_name="Студент AN", record_book_number="ЗК-AN")
        self.assignment = TeachingAssignment.objects.create(
            teacher=self.teacher,
            group=self.group,
            subject=self.subject,
        )
        Grade.objects.create(
            assignment=self.assignment,
            student=self.student,
            date="2026-04-01",
            value="8",
        )
        Grade.objects.create(
            assignment=self.assignment,
            student=self.student,
            date="2026-04-02",
            value="Н",
        )
        resp = self.client.post(
            "/v0/auth/login/",
            {"username": "analyticadmin", "password": "AdminPass1!"},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['access']}")

    def test_analytics_week_period(self):
        resp = self.client.get("/v0/admin/analytics/?period=week")
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertIn("grades", resp.data)
        self.assertIn("count", resp.data["grades"])
        self.assertGreaterEqual(resp.data["grades"]["count"], 2)
        self.assertEqual(resp.data["grades"]["average"], 8.0)

    def test_analytics_requires_staff(self):
        non_staff = User.objects.create_user(username="teacheronly", password="AdminPass1!")
        Teacher.objects.create(user=non_staff, full_name="Не админ")
        anon_client = APIClient()
        login = anon_client.post(
            "/v0/auth/login/",
            {"username": "teacheronly", "password": "AdminPass1!"},
            format="json",
        )
        anon_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
        self.assertEqual(anon_client.get("/v0/admin/analytics/?period=week").status_code, 403)

    def test_parse_grade_value_helper(self):
        from .analytics_views import _parse_grade_value

        self.assertEqual(_parse_grade_value("8"), 8.0)
        self.assertEqual(_parse_grade_value("7,5"), 7.5)
        self.assertIsNone(_parse_grade_value("Н"))
        self.assertIsNone(_parse_grade_value(""))