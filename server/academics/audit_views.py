"""API аудита журнала."""

from __future__ import annotations

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from academics.journal_views import _teacher_profile, _visible_assignments
from academics.models import JournalAuditLog


class JournalAuditListView(APIView):
    """GET /v0/journal-audit/?assignment=<id>&limit=100"""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        assignment_id = request.query_params.get("assignment")
        if not assignment_id:
            return Response({"detail": "assignment обязателен"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            aid = int(assignment_id)
        except (TypeError, ValueError):
            return Response({"detail": "Некорректный assignment"}, status=status.HTTP_400_BAD_REQUEST)

        teacher = _teacher_profile(request.user)
        visible = _visible_assignments(request.user, teacher)
        if not visible.filter(pk=aid).exists():
            return Response({"detail": "Нет доступа"}, status=status.HTTP_403_FORBIDDEN)

        limit = min(int(request.query_params.get("limit") or 100), 500)
        qs = JournalAuditLog.objects.filter(assignment_id=aid).select_related("actor").order_by("-created_at")
        if teacher and not request.user.is_staff:
            qs = qs.filter(actor=request.user)
        qs = qs[:limit]

        items = [
            {
                "id": row.pk,
                "action": row.action,
                "client_op_id": row.client_op_id,
                "payload": row.payload,
                "actor_id": row.actor_id,
                "actor_username": getattr(row.actor, "username", None) if row.actor_id else None,
                "created_at": row.created_at.isoformat(),
            }
            for row in qs
        ]
        return Response({"items": items})
