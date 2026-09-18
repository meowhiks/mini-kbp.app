"""Отправить тестовое письмо через текущий EMAIL_BACKEND (Resend / SMTP)."""

from __future__ import annotations

from django.conf import settings
from django.core.mail import send_mail
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Отправить тестовое письмо (Resend, если задан RESEND_API_KEY)"

    def add_arguments(self, parser):
        parser.add_argument("to", help="Адрес получателя")

    def handle(self, *args, **options):
        to = (options.get("to") or "").strip()
        if "@" not in to:
            raise CommandError("Укажите корректный email")
        from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@minikbp.local")
        html = "<p>Тестовое письмо MiniKBP через <strong>Resend</strong>.</p>"
        sent = send_mail(
            "MiniKBP — тестовое письмо",
            "Тестовое письмо MiniKBP через Resend.",
            from_email,
            [to],
            html_message=html,
            fail_silently=False,
        )
        if not sent:
            raise CommandError("Письмо не отправлено")
        self.stdout.write(self.style.SUCCESS(f"Отправлено на {to} от {from_email}"))
