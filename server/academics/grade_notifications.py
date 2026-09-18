"""Уведомления студенту об изменении отметки в журнале MiniKBP."""

from __future__ import annotations

import logging

from django.conf import settings

from accounts.grade_email import send_grade_change_email
from accounts.models import AppAccount, PushDevice
from accounts.telegram_notify import send_telegram_message

logger = logging.getLogger(__name__)


def format_grade_push(*, subject: str, marks: str) -> tuple[str, str]:
    title = (subject or "Предмет").strip() or "Предмет"
    value = (marks or "").strip() or "—"
    return title, f"У вас новые отметки : {value}"


def format_replacement_push(*, pair_number: int, new_name: str, old_name: str) -> tuple[str, str]:
    neu = (new_name or "Замена").strip() or "Замена"
    alt = (old_name or "занятие").strip() or "занятие"
    return f"Замена {int(pair_number)} урока!", f"{neu} вместо {alt}"


def _student_app_account(student) -> AppAccount | None:
    return (
        AppAccount.objects.filter(student_id=student.id)
        .select_related("student")
        .first()
    )


def _format_date(d) -> str:
    return d.strftime("%d.%m.%Y") if d else "—"


def _send_journal_push(account: AppAccount, *, title: str, body: str) -> None:
    tokens = list(
        PushDevice.objects.filter(account=account, active=True, notify_journal=True)
        .exclude(fcm_token="")
        .values_list("fcm_token", flat=True)
    )
    if not tokens:
        return
    try:
        from accounts.fcm_push import fcm_configured, send_fcm_messages

        if not fcm_configured():
            logger.info("Skip journal FCM: Firebase is not configured")
            return
        send_fcm_messages(tokens, title=title, body=body, source="journal")
    except Exception as exc:
        logger.warning("Grade FCM failed for account %s: %s", account.id, exc)


def notify_grade_changed(*, grade, old_value: str | None, deleted: bool = False) -> None:
    """Email, Telegram и FCM (если привязаны у AppAccount студента)."""
    student = grade.student
    assignment = grade.assignment
    subject = assignment.subject.name if assignment.subject_id else "Предмет"
    date_s = _format_date(grade.date)
    new_value = (grade.value or "").strip()
    old_s = (old_value or "").strip()

    if deleted:
        if not old_s:
            return
        body_line = f"Отметка снята: {old_s} → —"
        push_marks = None
    elif old_s and old_s != new_value:
        body_line = f"Изменение: {old_s} → {new_value or '—'}"
        push_marks = new_value
    elif not old_s and new_value:
        body_line = f"Новая отметка: {new_value}"
        push_marks = new_value
    else:
        return

    title = f"Журнал MiniKBP — {subject}"
    text = (
        f"{title}\n"
        f"Студент: {student.full_name}\n"
        f"Дата: {date_s}\n"
        f"{body_line}"
    )
    app_url = getattr(settings, "APP_PUBLIC_URL", None) or ""
    if not app_url:
        import os

        app_url = os.environ.get("APP_PUBLIC_URL", "https://lk.mini-kbp.site")
    text_full = f"{text}\n\nОткрыть: {app_url.rstrip('/')}/app/journal"

    account = _student_app_account(student)
    if not account:
        return

    if account.email:
        try:
            send_grade_change_email(
                to_email=account.email,
                subject_line=title,
                body_text=text_full,
            )
        except Exception as exc:
            logger.warning("Grade email failed for student %s: %s", student.id, exc)

    if account.telegram_id:
        send_telegram_message(chat_id=account.telegram_id, text=text_full)

    if push_marks:
        push_title, push_body = format_grade_push(subject=subject, marks=push_marks)
        _send_journal_push(account, title=push_title, body=push_body)
