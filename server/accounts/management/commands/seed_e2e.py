from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from accounts.models import Teacher, Student
from academics.models import Group, Subject, TeachingAssignment, Enrollment, Grade

User = get_user_model()

E2E_ADMIN_USERNAME = "e2e_admin"
E2E_ADMIN_PASSWORD = "E2eAdminPass1!"

E2E_TEACHER_A = "e2e_teacher"
E2E_TEACHER_B = "e2e_teacher_b"
E2E_TEACHER_PASSWORD = "E2eTeacherPass1!"


class Command(BaseCommand):
    help = "Создать учётные записи для Playwright E2E (admin + teachers + journal fixture)"

    def handle(self, *args, **options):
        admin, created = User.objects.get_or_create(
            username=E2E_ADMIN_USERNAME,
            defaults={"email": "e2e_admin@test.by", "is_staff": True, "is_active": True},
        )
        admin.is_staff = True
        admin.is_active = True
        admin.set_password(E2E_ADMIN_PASSWORD)
        admin.save()
        Teacher.objects.get_or_create(user=admin, defaults={"full_name": "E2E Admin", "is_active": True})

        group, _ = Group.objects.get_or_create(name="E2E-01", defaults={"description": "E2E group"})
        subject, _ = Subject.objects.get_or_create(
            name="E2E Subject",
            defaults={"short_name": "E2E", "is_active": True},
        )

        for username, full_name in (
            (E2E_TEACHER_A, "E2E Teacher A"),
            (E2E_TEACHER_B, "E2E Teacher B"),
        ):
            user, _ = User.objects.get_or_create(
                username=username,
                defaults={"email": f"{username}@test.by", "is_active": True},
            )
            user.set_password(E2E_TEACHER_PASSWORD)
            user.save()
            teacher, _ = Teacher.objects.get_or_create(
                user=user, defaults={"full_name": full_name, "is_active": True}
            )
            teacher.full_name = full_name
            teacher.is_active = True
            teacher.save()
            subject.teachers.add(teacher)
            assignment, _ = TeachingAssignment.objects.get_or_create(
                teacher=teacher,
                group=group,
                subject=subject,
                defaults={"lesson_type": "lecture", "is_active": True},
            )
            assignment.is_active = True
            assignment.save()

        student, _ = Student.objects.get_or_create(
            record_book_number="E2E-RB-001",
            defaults={"full_name": "E2E Student", "is_active": True},
        )
        Enrollment.objects.get_or_create(student=student, group=group, defaults={"is_active": True})

        teacher_a = Teacher.objects.get(user__username=E2E_TEACHER_A)
        assignment_a = TeachingAssignment.objects.get(teacher=teacher_a, group=group, subject=subject)
        Grade.objects.get_or_create(
            assignment=assignment_a,
            student=student,
            date="2026-03-01",
            slot=0,
            defaults={"value": "4"},
        )

        self.stdout.write(self.style.SUCCESS("E2E seed OK"))
        self.stdout.write(f"  admin: {E2E_ADMIN_USERNAME} / {E2E_ADMIN_PASSWORD}")
        self.stdout.write(f"  teachers: {E2E_TEACHER_A}, {E2E_TEACHER_B} / {E2E_TEACHER_PASSWORD}")
