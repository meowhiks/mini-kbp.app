"""Пакетное зачисление студентов в группу."""

from django.db import transaction
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsStaffUser
from accounts.models import Student
from .models import Enrollment, Group
from .serializers import EnrollmentSerializer


class EnrollmentBatchView(APIView):
    """POST /api/enrollments/batch/ — { group, student_ids: [] }"""

    permission_classes = [permissions.IsAuthenticated, IsStaffUser]

    def post(self, request):
        try:
            group_id = int(request.data.get("group"))
        except (TypeError, ValueError):
            return Response({"detail": "group обязателен"}, status=400)

        raw_ids = request.data.get("student_ids") or []
        if not isinstance(raw_ids, list) or not raw_ids:
            return Response({"detail": "student_ids: непустой список"}, status=400)

        try:
            group = Group.objects.get(pk=group_id, is_active=True)
        except Group.DoesNotExist:
            return Response({"detail": "Группа не найдена"}, status=404)

        parsed_ids: list[int] = []
        skipped = 0
        for raw in raw_ids:
            try:
                parsed_ids.append(int(raw))
            except (TypeError, ValueError):
                skipped += 1

        valid_ids = set(
            Student.objects.filter(pk__in=parsed_ids, is_active=True).values_list("pk", flat=True)
        )

        created = 0
        reactivated = 0
        items = []

        with transaction.atomic():
            for sid in parsed_ids:
                if sid not in valid_ids:
                    skipped += 1
                    continue
                enrollment, was_created = Enrollment.objects.get_or_create(
                    student_id=sid,
                    group=group,
                    defaults={"is_active": True},
                )
                if was_created:
                    created += 1
                elif not enrollment.is_active:
                    enrollment.is_active = True
                    enrollment.save(update_fields=["is_active"])
                    reactivated += 1
                else:
                    skipped += 1
                items.append(EnrollmentSerializer(enrollment).data)

        return Response(
            {
                "created": created,
                "reactivated": reactivated,
                "skipped": skipped,
                "items": items,
            },
            status=201,
        )
