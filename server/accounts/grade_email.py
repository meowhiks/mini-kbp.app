"""HTML-письмо об изменении отметки."""

from __future__ import annotations

from django.conf import settings
from django.core.mail import send_mail

from accounts.mail_utils import outbound_email_enabled


def send_grade_change_email(*, to_email: str, subject_line: str, body_text: str) -> None:
    if not outbound_email_enabled():
        return
    html = f"""<!DOCTYPE html>
<html lang="ru"><body style="font-family:sans-serif;padding:24px;line-height:1.5;color:#111827;">
  <p style="font-size:18px;font-weight:600;">{subject_line}</p>
  <pre style="white-space:pre-wrap;font-size:15px;">{body_text}</pre>
</body></html>"""
    send_mail(
        subject_line,
        body_text,
        getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@minikbp.local"),
        [to_email],
        html_message=html,
        fail_silently=False,
    )
