"""Пакетная синхронизация офлайн-операций журнала."""

from __future__ import annotations

from django.db import transaction
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.staff_lock_permission import StaffSessionUnlocked
from academics.journal_audit import log_journal_action
from academics.journal_views import _can_edit_assignment, _teacher_profile, _visible_assignments
from academics.models import Grade, TeachingAssignment


def _grade_key(assignment_id: int, student_id: int, date: str, slot: int) -> tuple:
    return assignment_id, student_id, date, slot


class JournalSyncBatchView(APIView):
    """POST /v0/journal-sync/batch/ — применить офлайн-операции."""

    permission_classes = [permissions.IsAuthenticated, StaffSessionUnlocked]

    def post(self, request):
        ops = request.data.get("ops") or []
        if not isinstance(ops, list):
            return Response({"detail": "ops должен быть массивом"}, status=status.HTTP_400_BAD_REQUEST)

        teacher = _teacher_profile(request.user)
        applied: list[str] = []
        conflicts: list[dict] = []

        for op in ops:
            client_op_id = str(op.get("client_op_id") or "")
            assignment_id = op.get("assignment_id")
            student_id = op.get("student_id")
            date = op.get("date")
            slot = int(op.get("slot") or 0)
            value = str(op.get("value") or "")
            op_type = op.get("type") or "grade_set"

            if not client_op_id or not assignment_id or not student_id or not date:
                continue

            try:
                assignment = TeachingAssignment.objects.get(pk=int(assignment_id))
            except (TeachingAssignment.DoesNotExist, TypeError, ValueError):
                continue

            if not _visible_assignments(request.user, teacher).filter(pk=assignment.pk).exists():
                continue
            if not _can_edit_assignment(request.user, teacher, assignment):
                continue

            existing = Grade.objects.filter(
                assignment=assignment,
                student_id=int(student_id),
                date=date,
                slot=slot,
            ).first()
            server_value = existing.value if existing else ""

            if server_value and server_value != value and op_type in ("grade_set", "grade_delete"):
                conflicts.append(
                    {
                        "client_op_id": client_op_id,
                        "student_id": int(student_id),
                        "date": date,
                        "slot": slot,
                        "client_value": value,
                        "server_value": server_value,
                    }
                )
                continue

            with transaction.atomic():
                if op_type == "grade_delete" or not value.strip():
                    if existing:
                        log_journal_action(
                            assignment=assignment,
                            actor=request.user,
                            action="grade_delete",
                            client_op_id=client_op_id,
                            payload={"student_id": student_id, "date": date, "slot": slot, "before": server_value},
                        )
                        existing.delete()
                else:
                    if existing:
                        old = existing.value
                        existing.value = value
                        existing.save(update_fields=["value", "updated_at"])
                        action = "grade_set"
                        payload = {"student_id": student_id, "date": date, "slot": slot, "before": old, "after": value}
                    else:
                        Grade.objects.create(
                            assignment=assignment,
                            student_id=int(student_id),
                            date=date,
                            slot=slot,
                            value=value,
                        )
                        action = "grade_set"
                        payload = {"student_id": student_id, "date": date, "slot": slot, "before": "", "after": value}
                    log_journal_action(
                        assignment=assignment,
                        actor=request.user,
                        action=action,
                        client_op_id=client_op_id,
                        payload=payload,
                    )
            applied.append(client_op_id)

        return Response({"applied": applied, "conflicts": conflicts})


class JournalSyncResolveView(APIView):
    """POST /v0/journal-sync/resolve/ — разрешить конфликты."""

    permission_classes = [permissions.IsAuthenticated, StaffSessionUnlocked]

    def post(self, request):
        resolutions = request.data.get("resolutions") or []
        if not isinstance(resolutions, list):
            return Response({"detail": "resolutions должен быть массивом"}, status=status.HTTP_400_BAD_REQUEST)

        teacher = _teacher_profile(request.user)
        remaining: list[dict] = []

        for item in resolutions:
            choice = item.get("choice")
            client_op_id = str(item.get("client_op_id") or "")
            assignment_id = item.get("assignment_id")
            student_id = item.get("student_id")
            date = item.get("date")
            slot = int(item.get("slot") or 0)
            client_value = str(item.get("client_value") or "")
            server_value = str(item.get("server_value") or "")

            if not assignment_id or not student_id or not date:
                continue

            try:
                assignment = TeachingAssignment.objects.get(pk=int(assignment_id))
            except (TeachingAssignment.DoesNotExist, TypeError, ValueError):
                continue

            if not _can_edit_assignment(request.user, teacher, assignment):
                continue

            existing = Grade.objects.filter(
                assignment=assignment,
                student_id=int(student_id),
                date=date,
                slot=slot,
            ).first()

            if choice == "mine":
                value = client_value
                if not value.strip():
                    if existing:
                        existing.delete()
                elif existing:
                    existing.value = value
                    existing.save(update_fields=["value", "updated_at"])
                else:
                    Grade.objects.create(
                        assignment=assignment,
                        student_id=int(student_id),
                        date=date,
                        slot=slot,
                        value=value,
                    )
                log_journal_action(
                    assignment=assignment,
                    actor=request.user,
                    action="grade_set" if value.strip() else "grade_delete",
                    client_op_id=client_op_id,
                    payload={"resolved": "mine", "client_value": client_value, "server_value": server_value},
                )
            else:
                if existing and server_value:
                    pass
                elif existing and not server_value:
                    existing.delete()

        return Response({"ok": True, "conflicts": remaining})
