"""HTML-письма приложения /app."""

from __future__ import annotations

import os

from django.conf import settings
from django.core.mail import send_mail

from accounts.mail_utils import outbound_email_enabled


def _public_app_url() -> str:
    return (os.environ.get("APP_PUBLIC_URL") or os.environ.get("NEXT_PUBLIC_APP_URL") or "http://localhost:3000").rstrip("/")


def _from_email() -> str:
    return getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@minikbp.local")


def send_registration_email(*, to_email: str, magic_link: str, code: str) -> None:
    if not outbound_email_enabled():
        return
    subject = "Подтверждение регистрации — MiniKBP"
    html = f"""<!DOCTYPE html>
<html lang="ru">
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:420px;background:#fff;border-radius:16px;padding:32px 28px;">
        <tr><td style="font-size:20px;font-weight:600;color:#111827;padding-bottom:8px;">Подтвердите почту</td></tr>
        <tr><td style="font-size:15px;line-height:1.5;color:#4b5563;padding-bottom:24px;">
          Нажмите кнопку, чтобы завершить регистрацию в MiniKBP.
        </td></tr>
        <tr><td align="center" style="padding-bottom:24px;">
          <a href="{magic_link}" style="display:inline-block;background:#3390ec;color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 28px;border-radius:12px;">
            Подтвердить email
          </a>
        </td></tr>
        <tr><td style="font-size:13px;line-height:1.5;color:#6b7280;padding-bottom:8px;">
          Или введите код вручную:
        </td></tr>
        <tr><td align="center" style="font-size:28px;font-weight:700;letter-spacing:0.2em;color:#111827;padding-bottom:16px;">
          {code}
        </td></tr>
        <tr><td style="font-size:12px;color:#9ca3af;word-break:break-all;">
          {magic_link}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""
    text = f"Подтвердите регистрацию MiniKBP:\n\n{magic_link}\n\nКод: {code}\n"
    send_mail(subject, text, _from_email(), [to_email], html_message=html, fail_silently=False)


def send_password_reset_email(*, to_email: str, code: str) -> None:
    if not outbound_email_enabled():
        return
    subject = "Сброс пароля — MiniKBP"
    html = f"""<!DOCTYPE html>
<html lang="ru"><body style="font-family:sans-serif;padding:24px;">
  <p>Код для сброса пароля MiniKBP:</p>
  <p style="font-size:28px;font-weight:700;letter-spacing:0.15em;">{code}</p>
  <p style="color:#6b7280;font-size:13px;">Код действует 15 минут.</p>
</body></html>"""
    send_mail(subject, f"Код сброса пароля: {code}", _from_email(), [to_email], html_message=html, fail_silently=False)


def build_registration_magic_link(token: str) -> str:
    return f"{_public_app_url()}/app?verify_email={token}"
