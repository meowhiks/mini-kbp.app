"""Staff API для справочника расписания kbp."""

from __future__ import annotations

from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from academics.kbp_catalog import KbpTeacher
from academics.invite_views import _can_manage_invites


class KbpCatalogTeachersView(APIView):
    """GET /v0/kbp-catalog/teachers/?q= — поиск преподавателей каталога."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not _can_manage_invites(request.user):
            return Response({"detail": "Нет прав"}, status=403)

        q = (request.query_params.get("q") or "").strip()
        qs = KbpTeacher.objects.filter(is_active=True).order_by("name")
        if q:
            qs = qs.filter(name__icontains=q)

        limit = 50
        try:
            limit = max(1, min(int(request.query_params.get("limit") or 50), 200))
        except (TypeError, ValueError):
            pass

        teachers = list(qs[:limit])
        linked_ids = set(
            KbpTeacher.objects.filter(
                id__in=[t.id for t in teachers],
                linked_teacher__isnull=False,
            ).values_list("id", flat=True)
        )
        return Response(
            [
                {
                    "id": t.id,
                    "kbp_id": t.kbp_id,
                    "name": t.name,
                    "linked": t.id in linked_ids,
                }
                for t in teachers
            ]
        )
