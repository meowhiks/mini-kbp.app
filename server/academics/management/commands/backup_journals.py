from django.core.management.base import BaseCommand

from academics.journal_backup import create_daily_backup


class Command(BaseCommand):
    help = "Создать сжатый бэкап всех журналов (запускать ежедневно в 00:00)"

    def add_arguments(self, parser):
        parser.add_argument("--force", action="store_true", help="Перезаписать бэкап за сегодня")

    def handle(self, *args, **options):
        obj = create_daily_backup(force=options["force"])
        if not obj:
            self.stdout.write("Бэкап на сегодня уже существует")
            return
        self.stdout.write(
            self.style.SUCCESS(
                f"Бэкап {obj.backup_date}: {obj.uncompressed_bytes} → {obj.compressed_bytes} байт "
                f"({obj.stats})"
            )
        )
