"""API журнала: bundle, дни, опоздания, доступ."""

from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from accounts.models import Teacher
from accounts.staff_lock_permission import StaffSessionUnlocked
from .models import (
    Group,
    TeachingAssignment,
    Grade,
    JournalDay,
    LatenessRecord,
    GroupCurator,
    Enrollment,
)
from .serializers import TeachingAssignmentSerializer
from .journal_serializers import JournalDaySerializer, LatenessRecordSerializer, GroupCuratorSerializer


def _teacher_profile(user):
    return getattr(user, "teacher_profile", None)


def _can_edit_assignment(user, teacher, assignment: TeachingAssignment) -> bool:
    if user.is_staff:
        return True
    if teacher and assignment.teacher_id == teacher.id:
        return True
    return False


def _visible_assignments(user, teacher: Teacher | None):
    if user.is_staff and not teacher:
        return TeachingAssignment.objects.filter(is_active=True).select_related(
            "teacher", "group", "subject"
        )
    if not teacher:
        return TeachingAssignment.objects.none()
    own = TeachingAssignment.objects.filter(teacher=teacher, is_active=True)
    curator_group_ids = GroupCurator.objects.filter(teacher=teacher).values_list(
        "group_id", flat=True
    )
    curated = TeachingAssignment.objects.filter(
        group_id__in=curator_group_ids, is_active=True
    )
    return (own | curated).select_related("teacher", "group", "subject").distinct()


class JournalDayViewSet(viewsets.ModelViewSet):
    queryset = JournalDay.objects.all()
    serializer_class = JournalDaySerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [permissions.IsAuthenticated()]
        return [permissions.IsAuthenticated(), StaffSessionUnlocked()]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if not user.is_staff:
            teacher = _teacher_profile(user)
            if teacher:
                qs = qs.filter(assignment_id__in=_visible_assignments(user, teacher).values("pk"))
            else:
                qs = qs.none()
        assignment_id = self.request.query_params.get("assignment")
        if assignment_id:
            qs = qs.filter(assignment_id=assignment_id)
        return qs

    def perform_create(self, serializer):
        assignment = serializer.validated_data["assignment"]
        teacher = _teacher_profile(self.request.user)
        if not _can_edit_assignment(self.request.user, teacher, assignment):
            raise PermissionDenied("Нет прав на редактирование")
        serializer.save()

    def perform_update(self, serializer):
        assignment = serializer.instance.assignment
        teacher = _teacher_profile(self.request.user)
        if not _can_edit_assignment(self.request.user, teacher, assignment):
            raise PermissionDenied("Нет прав на редактирование")
        serializer.save()

    def perform_destroy(self, instance):
        teacher = _teacher_profile(self.request.user)
        if not _can_edit_assignment(self.request.user, teacher, instance.assignment):
            raise PermissionDenied("Нет прав на редактирование")
        instance.delete()


class LatenessViewSet(viewsets.ModelViewSet):
    queryset = LatenessRecord.objects.select_related("student", "group").all()
    serializer_class = LatenessRecordSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [permissions.IsAuthenticated()]
        return [permissions.IsAuthenticated(), StaffSessionUnlocked()]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if not user.is_staff:
            teacher = _teacher_profile(user)
            if teacher:
                group_ids = set(
                    TeachingAssignment.objects.filter(
                        teacher=teacher, is_active=True
                    ).values_list("group_id", flat=True)
                ) | set(
                    GroupCurator.objects.filter(teacher=teacher).values_list(
                        "group_id", flat=True
                    )
                )
                qs = qs.filter(group_id__in=group_ids) if group_ids else qs.none()
            else:
                from accounts.student_views import _resolve_student_user

                student = _resolve_student_user(user)
                qs = qs.filter(student=student) if student else qs.none()
        group_id = self.request.query_params.get("group")
        if group_id:
            qs = qs.filter(group_id=group_id)
        return qs

    def _check_group_edit(self, group_id: int):
        user = self.request.user
        teacher = _teacher_profile(user)
        if user.is_staff:
            return
        if not teacher:
            raise PermissionDenied()
        if GroupCurator.objects.filter(teacher=teacher, group_id=group_id).exists():
            raise PermissionDenied("Куратор не может редактировать")
        if not TeachingAssignment.objects.filter(
            teacher=teacher, group_id=group_id, is_active=True
        ).exists():
            raise PermissionDenied("Нет назначения в этой группе")

    def perform_create(self, serializer):
        group = serializer.validated_data["group"]
        self._check_group_edit(group.id)
        serializer.save()

    def perform_update(self, serializer):
        self._check_group_edit(serializer.instance.group_id)
        serializer.save()

    def perform_destroy(self, instance):
        self._check_group_edit(instance.group_id)
        instance.delete()


class JournalAccessViewSet(viewsets.ViewSet):
    """GET /api/journal/access/ — группы и назначения для журнала."""

    permission_classes = [permissions.IsAuthenticated]

    def list(self, request):
        teacher = _teacher_profile(request.user)
        qs = _visible_assignments(request.user, teacher)
        groups_with_students = set(
            Enrollment.objects.filter(is_active=True, student__is_active=True)
            .values_list("group_id", flat=True)
            .distinct()
        )
        groups_map: dict[int, dict] = {}
        seen_subject: set[tuple[int, int]] = set()
        curator_group_ids = set()
        if teacher:
            curator_group_ids = set(
                GroupCurator.objects.filter(teacher=teacher).values_list(
                    "group_id", flat=True
                )
            )

        for a in qs.order_by("group__name", "subject__name", "id"):
            can_edit = _can_edit_assignment(request.user, teacher, a)
            g = a.group
            if g.id not in groups_with_students:
                continue
            if (g.id, a.subject_id) in seen_subject:
                continue
            seen_subject.add((g.id, a.subject_id))
            if g.id not in groups_map:
                groups_map[g.id] = {
                    "id": g.id,
                    "name": g.name,
                    "is_curator": g.id in curator_group_ids,
                    "assignments": [],
                }
            groups_map[g.id]["assignments"].append(
                {
                    **TeachingAssignmentSerializer(a).data,
                    "can_edit": can_edit,
                }
            )

        return Response(list(groups_map.values()))

    @action(detail=False, methods=["get"], url_path="bundle/(?P<assignment_id>[^/.]+)")
    def bundle(self, request, assignment_id=None):
        try:
            assignment = TeachingAssignment.objects.select_related(
                "teacher", "group", "subject"
            ).get(pk=assignment_id)
        except TeachingAssignment.DoesNotExist:
            return Response({"detail": "Не найдено"}, status=404)

        teacher = _teacher_profile(request.user)
        visible = _visible_assignments(request.user, teacher).filter(pk=assignment_id)
        if not visible.exists():
            return Response({"detail": "Нет доступа"}, status=403)

        can_edit = _can_edit_assignment(request.user, teacher, assignment)
        enrollments = assignment.group.enrollments.filter(is_active=True).select_related(
            "student"
        )
        students = [
            {
                "id": e.student.id,
                "full_name": e.student.full_name,
                "record_book_number": e.student.record_book_number,
            }
            for e in enrollments
        ]
        grades = (
            Grade.objects.filter(assignment=assignment)
            .select_related("student")
            .order_by("date", "slot", "student__full_name")
        )
        days = (
            JournalDay.objects.filter(assignment=assignment)
            .order_by("date", "slot")
        )
        lateness = LatenessRecord.objects.filter(group=assignment.group)

        return Response(
            {
                "assignment": TeachingAssignmentSerializer(assignment).data,
                "can_edit": can_edit,
                "students": students,
                "grades": [
                    {
                        "id": g.id,
                        "student": g.student_id,
                        "date": g.date.isoformat(),
                        "slot": g.slot,
                        "value": g.value,
                        "comment": g.comment,
                    }
                    for g in grades
                ],
                "days": JournalDaySerializer(days, many=True).data,
                "lateness": LatenessRecordSerializer(lateness, many=True).data,
            }
        )


class GroupCuratorViewSet(viewsets.ModelViewSet):
    queryset = GroupCurator.objects.select_related("teacher", "group").all()
    serializer_class = GroupCuratorSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.is_staff:
            return qs
        teacher = getattr(self.request.user, "teacher_profile", None)
        if not teacher:
            return qs.none()
        return qs.filter(teacher=teacher)

    def perform_create(self, serializer):
        if not self.request.user.is_staff:
            raise PermissionDenied("Только администратор")
        serializer.save()

    def perform_update(self, serializer):
        if not self.request.user.is_staff:
            raise PermissionDenied("Только администратор")
        serializer.save()

    def perform_destroy(self, instance):
        if not self.request.user.is_staff:
            raise PermissionDenied("Только администратор")
        instance.delete()

