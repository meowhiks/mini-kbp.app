from django.core.management.base import BaseCommand

from academics.tests_invite import DemoFixturesMixin


class Command(BaseCommand):
    help = "Создать демо-данные для ручного тестирования админки и кодов входа"

    def handle(self, *args, **options):
        demo = DemoFixturesMixin.create_demo()
        self.stdout.write(self.style.SUCCESS("Демо-данные созданы:"))
        self.stdout.write(f"  Админ: admin@demo.by / DemoAdmin123!")
        self.stdout.write(f"  Группа: {demo['group'].name}")
        self.stdout.write(f"  Код студента: STUD01 (группа {demo['group'].name})")
        self.stdout.write(f"  Код преподавателя: TEACH1")
        self.stdout.write("")
        self.stdout.write("Регистрация: /app → ввод кода на шаге подтверждения")
        self.stdout.write("Админка: /staff (вход тем же admin@demo.by)")
