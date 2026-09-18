from django.core.management.base import BaseCommand

from accounts.models import AppAccount
from accounts.student_link import find_student_for_account, link_account_to_student, try_link_account_by_email


class Command(BaseCommand):
    help = "Привязать AppAccount к Student по email/ФИО в группе"

    def handle(self, *args, **options):
        linked = 0
        for account in AppAccount.objects.filter(student__isnull=True).select_related("group"):
            if account.group_id:
                found = find_student_for_account(account, account.group)
                if found:
                    link_account_to_student(account, found, account.group)
                    linked += 1
                    continue
            if try_link_account_by_email(account):
                linked += 1
        self.stdout.write(self.style.SUCCESS(f"Привязано аккаунтов: {linked}"))
