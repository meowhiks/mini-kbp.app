"""Запись аудита операций журнала."""

from __future__ import annotations

from django.contrib.auth.models import User

from academics.models import JournalAuditLog, TeachingAssignment


def log_journal_action(
    *,
    assignment: TeachingAssignment | int,
    actor: User | None,
    action: str,
    payload: dict | None = None,
    client_op_id: str = "",
) -> JournalAuditLog:
    assignment_id = assignment.pk if isinstance(assignment, TeachingAssignment) else assignment
    return JournalAuditLog.objects.create(
        assignment_id=assignment_id,
        actor=actor,
        action=action,
        payload=payload or {},
        client_op_id=client_op_id or "",
    )
