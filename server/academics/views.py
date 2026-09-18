from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from accounts.permissions import IsStaffUser
from accounts.staff_lock_permission import StaffSessionUnlocked
from .access import (
    filter_assignments_queryset,
    filter_enrollments_queryset,
    filter_grades_queryset,
    filter_groups_queryset,
    user_can_access_group,
)
from .models import Group, Subject, Enrollment, TeachingAssignment, Grade
from .grade_notifications import notify_grade_changed
from .journal_views import _teacher_profile, _can_edit_assignment as _can_edit_grade
from .journal_audit import log_journal_action
from .serializers import (
    GroupSerializer,
    SubjectSerializer,
    EnrollmentSerializer,
    TeachingAssignmentSerializer,
    GradeSerializer,
)


class _StaffWriteMixin:
    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsStaffUser()]
        return [permissions.IsAuthenticated()]


class GroupViewSet(_StaffWriteMixin, viewsets.ModelViewSet):
    """CRUD групп + действие list_students."""

    queryset = Group.objects.all()
    serializer_class = GroupSerializer

    def get_queryset(self):
        return filter_groups_queryset(self.request.user, super().get_queryset())

    @action(detail=True, methods=["get"], url_path="students")
    def list_students(self, request, pk=None):
        """Список активных студентов группы."""
        group = self.get_object()
        if not user_can_access_group(request.user, group.pk):
            raise PermissionDenied("Нет доступа к группе")
        enrollments = group.enrollments.filter(is_active=True).select_related("student")
        data = [
            {
                "id": e.student.id,
                "full_name": e.student.full_name,
                "record_book_number": e.student.record_book_number,
                "enrolled_at": e.enrolled_at,
            }
            for e in enrollments
        ]
        return Response(data)

    @action(detail=True, methods=["get"], url_path="assignments")
    def list_assignments(self, request, pk=None):
        """Список назначений (кто ведёт какие предметы в этой группе)."""
        group = self.get_object()
        if not user_can_access_group(request.user, group.pk):
            raise PermissionDenied("Нет доступа к группе")
        qs = group.assignments.filter(is_active=True).select_related("teacher", "subject")
        return Response(TeachingAssignmentSerializer(qs, many=True).data)


class SubjectViewSet(_StaffWriteMixin, viewsets.ModelViewSet):
    """CRUD предметов."""

    queryset = Subject.objects.prefetch_related("teachers").all()
    serializer_class = SubjectSerializer


class EnrollmentViewSet(_StaffWriteMixin, viewsets.ModelViewSet):
    """Зачисление студентов в группы."""

    queryset = Enrollment.objects.select_related("student", "group").all()
    serializer_class = EnrollmentSerializer

    def get_queryset(self):
        return filter_enrollments_queryset(self.request.user, super().get_queryset())


class TeachingAssignmentViewSet(_StaffWriteMixin, viewsets.ModelViewSet):
    """
    CRUD назначений «учитель → группа → предмет».

    Доп. действие: GET /api/assignments/by-teacher/{teacher_id}/
    возвращает все назначения конкретного учителя.
    """

    queryset = TeachingAssignment.objects.select_related(
        "teacher", "group", "subject"
    ).all()
    serializer_class = TeachingAssignmentSerializer

    def get_queryset(self):
        return filter_assignments_queryset(self.request.user, super().get_queryset())

    @action(detail=False, methods=["get"], url_path="by-teacher/(?P<teacher_id>[^/.]+)")
    def by_teacher(self, request, teacher_id=None):
        teacher = _teacher_profile(request.user)
        if not request.user.is_staff and (
            not teacher or str(teacher.id) != str(teacher_id)
        ):
            raise PermissionDenied("Нет доступа")
        qs = self.get_queryset().filter(teacher_id=teacher_id, is_active=True)
        return Response(self.get_serializer(qs, many=True).data)


class GradeViewSet(viewsets.ModelViewSet):
    """
    CRUD отметок кастомного журнала.

    Фильтры query-параметрами: ?assignment=, ?student=, ?group=
    """

    queryset = Grade.objects.select_related(
        "assignment__teacher",
        "assignment__group",
        "assignment__subject",
        "student",
    ).all()
    serializer_class = GradeSerializer
    permission_classes = [permissions.IsAuthenticated, StaffSessionUnlocked]

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [permissions.IsAuthenticated()]
        return [permissions.IsAuthenticated(), StaffSessionUnlocked()]

    def get_queryset(self):
        qs = filter_grades_queryset(self.request.user, super().get_queryset())
        assignment_id = self.request.query_params.get("assignment")
        student_id = self.request.query_params.get("student")
        group_id = self.request.query_params.get("group")
        if assignment_id:
            qs = qs.filter(assignment_id=assignment_id)
        if student_id:
            qs = qs.filter(student_id=student_id)
        if group_id:
            qs = qs.filter(assignment__group_id=group_id)
        return qs

    def perform_create(self, serializer):
        teacher = _teacher_profile(self.request.user)
        assignment = serializer.validated_data.get("assignment") or getattr(
            self, "instance", None
        )
        if assignment and isinstance(assignment, TeachingAssignment):
            a = assignment
        else:
            a = serializer.validated_data["assignment"]
        if not _can_edit_grade(self.request.user, teacher, a):
            raise PermissionDenied("Нет прав на редактирование")
        grade = serializer.save()
        notify_grade_changed(grade=grade, old_value=None)
        log_journal_action(
            assignment=grade.assignment,
            actor=self.request.user,
            action="grade_set",
            payload={"student_id": grade.student_id, "date": str(grade.date), "slot": grade.slot, "after": grade.value},
        )

    def perform_update(self, serializer):
        teacher = _teacher_profile(self.request.user)
        if not _can_edit_grade(self.request.user, teacher, serializer.instance.assignment):
            raise PermissionDenied("Нет прав на редактирование")
        old_value = serializer.instance.value
        grade = serializer.save()
        notify_grade_changed(grade=grade, old_value=old_value)
        log_journal_action(
            assignment=grade.assignment,
            actor=self.request.user,
            action="grade_set",
            payload={
                "student_id": grade.student_id,
                "date": str(grade.date),
                "slot": grade.slot,
                "before": old_value,
                "after": grade.value,
            },
        )

    def perform_destroy(self, instance):
        teacher = _teacher_profile(self.request.user)
        if not _can_edit_grade(self.request.user, teacher, instance.assignment):
            raise PermissionDenied("Нет прав на редактирование")
        notify_grade_changed(grade=instance, old_value=instance.value, deleted=True)
        log_journal_action(
            assignment=instance.assignment,
            actor=self.request.user,
            action="grade_delete",
            payload={
                "student_id": instance.student_id,
                "date": str(instance.date),
                "slot": instance.slot,
                "before": instance.value,
            },
        )
        instance.delete()

    @action(detail=False, methods=["get"], url_path="by-assignment/(?P<assignment_id>[^/.]+)")
    def by_assignment(self, request, assignment_id=None):
        """Таблица отметок по назначению: студенты группы + их оценки."""
        qs = self.get_queryset().filter(assignment_id=assignment_id)
        return Response(self.get_serializer(qs, many=True).data)
