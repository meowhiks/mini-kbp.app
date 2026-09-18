"""Вход студента и выдача журнала из Django."""

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import AppAccount, Student
from academics.models import Enrollment, Group


class PublicGroupListView(APIView):
    """Список групп — только для авторизованных пользователей."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from academics.access import filter_groups_queryset

        qs = filter_groups_queryset(
            request.user, Group.objects.filter(is_active=True).order_by("name")
        )
        return Response([{"id": str(g.id), "name": g.name} for g in qs])


class StudentLoginView(APIView):
    """
    Legacy student-login отключён — используйте /app (email/Telegram/Google).
    """

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        return Response(
            {
                "detail": "Вход по фамилии и дате рождения отключён. "
                "Используйте вход через приложение MiniKBP."
            },
            status=status.HTTP_410_GONE,
        )


def _resolve_student_user(user) -> Student | None:
    """Студент для JWT: student_profile или AppAccount.student."""
    profile = getattr(user, "student_profile", None)
    if profile and profile.is_active:
        return profile
    account = AppAccount.objects.filter(user=user).select_related("student").first()
    if account and account.student_id and account.student and account.student.is_active:
        return account.student
    return None


class IsStudentUser(permissions.BasePermission):
    def has_permission(self, request, view):
        return _resolve_student_user(request.user) is not None


class StudentJournalView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsStudentUser]

    def get(self, request):
        from academics.student_journal import build_student_journal

        student = _resolve_student_user(request.user)
        if not student:
            return Response({"detail": "Нет привязки к студенту"}, status=403)
        enrollment = (
            Enrollment.objects.filter(student=student, is_active=True)
            .select_related("group")
            .order_by("-enrolled_at")
            .first()
        )
        if not enrollment:
            account = AppAccount.objects.filter(user=request.user).select_related("group").first()
            if account and account.group_id:
                group = account.group
                return Response(build_student_journal(student, group))
            return Response({"detail": "Нет активной группы"}, status=404)
        return Response(build_student_journal(student, enrollment.group))


class StudentLatenessView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsStudentUser]

    def get(self, request):
        from academics.student_journal import build_student_lateness

        student = _resolve_student_user(request.user)
        if not student:
            return Response({"detail": "Нет привязки к студенту"}, status=403)
        enrollment = (
            Enrollment.objects.filter(student=student, is_active=True)
            .select_related("group")
            .first()
        )
        if not enrollment:
            account = AppAccount.objects.filter(user=request.user).select_related("group").first()
            if account and account.group_id:
                return Response(build_student_lateness(student, account.group))
            return Response({"detail": "Нет активной группы"}, status=404)
        return Response(build_student_lateness(student, enrollment.group))
