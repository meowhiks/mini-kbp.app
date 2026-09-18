"""Синхронизация каталога расписания с kbp.by.

Пример:
  python manage.py sync_kbp_catalog
  python manage.py sync_kbp_catalog --entities-only
  python manage.py sync_kbp_catalog --limit 5 --dry-run
"""

from django.core.management.base import BaseCommand

from academics.kbp_sync import run_sync


class Command(BaseCommand):
    help = "Импорт групп/учителей/предметов/аудиторий и связей из kbp.by"

    def add_arguments(self, parser):
        parser.add_argument(
            "--entities-only",
            action="store_true",
            help="Только индекс ?q=, без обхода страниц групп",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=None,
            help="Максимум страниц групп для обхода",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Не писать в БД, только парсить",
        )
        parser.add_argument(
            "--delay",
            type=float,
            default=0.4,
            help="Пауза между запросами страниц групп (сек)",
        )

    def handle(self, *args, **options):
        stats = run_sync(
            entities_only=options["entities_only"],
            limit=options["limit"],
            dry_run=options["dry_run"],
            delay_sec=float(options["delay"] or 0),
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"entities_upserted={stats.entities_upserted} "
                f"deactivated={stats.entities_deactivated} "
                f"groups_fetched={stats.groups_fetched} "
                f"links_upserted={stats.links_upserted}"
            )
        )
        for err in stats.errors or []:
            self.stderr.write(self.style.WARNING(err))
