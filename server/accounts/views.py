from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from accounts.jwt_tokens import issue_token_pair
from kbp_server.throttling import AuthAnonRateThrottle

from accounts.permissions import IsStaffOrTeacherMe, IsStaffUser
from .models import Teacher, Student
from .serializers import (
    TeacherSerializer,
    TeacherCreateSerializer,
    StudentSerializer,
    StudentCreateSerializer,
)


class TeacherViewSet(viewsets.ModelViewSet):
    """
    CRUD по учителям. На этом этапе все эндпоинты защищены JWT.

    POST /api/teachers/         — создать учителя (создаёт User + Teacher)
    GET /api/teachers/          — список
    GET /api/teachers/{id}/     — детально
    PATCH/PUT /api/teachers/{id}/ — обновить профиль
    DELETE /api/teachers/{id}/  — удалить
    """

    queryset = Teacher.objects.select_related("user").all()
    permission_classes = [IsStaffOrTeacherMe]

    def get_serializer_class(self):
        if self.action == "create":
            return TeacherCreateSerializer
        return TeacherSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        teacher = serializer.save()
        out = TeacherSerializer(teacher).data
        return Response(out, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], url_path="me")
    def me(self, request):
        """Текущий авторизованный учитель (если это учитель)."""
        teacher = getattr(request.user, "teacher_profile", None)
        if not teacher:
            return Response({"detail": "Not a teacher."}, status=403)
        return Response(TeacherSerializer(teacher).data)


class StudentViewSet(viewsets.ModelViewSet):
    """CRUD по студентам."""

    queryset = Student.objects.all()
    permission_classes = [IsStaffUser]

    def get_serializer_class(self):
        if self.action == "create":
            return StudentCreateSerializer
        return StudentSerializer

    @action(detail=True, methods=["post"], url_path="impersonate")
    def impersonate(self, request, pk=None):
        if not request.user.is_staff:
            return Response({"detail": "Только администратор"}, status=403)
        student = self.get_object()
        from accounts.student_link import resolve_impersonation

        user, account, group = resolve_impersonation(student)
        tokens = issue_token_pair(user, request)
        return Response(
            {
                **tokens,
                "student_id": student.id,
                "full_name": student.full_name,
                "group_id": str(group.id) if group else "",
                "group_name": group.name if group else "",
            }
        )

    def destroy(self, request, *args, **kwargs):
        from accounts.totp_guard import require_admin_totp

        if not request.user.is_staff:
            return Response({"detail": "Только администратор"}, status=status.HTTP_403_FORBIDDEN)
        err = require_admin_totp(request)
        if err:
            return err
        student = self.get_object()
        from accounts.person_name import names_match

        confirm = str(request.data.get("confirm_name") or "")
        if not names_match(confirm, student.full_name):
            return Response(
                {"detail": "Введите полное ФИО студента для подтверждения"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["post"], url_path="reset-app")
    def reset_app(self, request, pk=None):
        if not request.user.is_staff:
            return Response({"detail": "Только администратор"}, status=403)
        student = self.get_object()
        from accounts.models import AppAccount

        AppAccount.objects.filter(student=student).update(
            student=None,
            group=None,
            group_verified_at=None,
        )
        if student.user_id:
            AppAccount.objects.filter(user=student.user).update(
                student=None,
                group=None,
                group_verified_at=None,
            )
        return Response({"ok": True})


class TeacherLoginView(APIView):
    """
    POST /api/auth/login/

    Тело: {"username": "...", "password": "..."}
    Ответ: {"access": "...", "refresh": "...", "teacher_id": <id>}
    """

    permission_classes = [permissions.AllowAny]
    throttle_classes = [AuthAnonRateThrottle]

    def post(self, request):
        from django.contrib.auth import authenticate

        username = request.data.get("username")
        password = request.data.get("password")
        if not username or not password:
            return Response(
                {"detail": "username и password обязательны"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = authenticate(request, username=username, password=password)
        if user is None:
            return Response(
                {"detail": "Неверный логин или пароль"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        teacher = getattr(user, "teacher_profile", None)
        if teacher is None:
            return Response(
                {"detail": "У пользователя нет профиля учителя"},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not teacher.is_active:
            return Response(
                {"detail": "Учитель деактивирован"},
                status=status.HTTP_403_FORBIDDEN,
            )

        tokens = issue_token_pair(user, request)
        return Response(
            {
                **tokens,
                "teacher_id": teacher.id,
                "full_name": teacher.full_name,
            }
        )


class AdminLoginView(APIView):
    """
    POST /api/auth/admin-login/

    Вход для администратора (is_staff). Не требует профиля учителя.
    """

    permission_classes = [permissions.AllowAny]
    throttle_classes = [AuthAnonRateThrottle]

    def post(self, request):
        from django.contrib.auth import authenticate

        username = request.data.get("username")
        password = request.data.get("password")
        if not username or not password:
            return Response(
                {"detail": "username и password обязательны"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = authenticate(request, username=username, password=password)
        if user is None:
            return Response(
                {"detail": "Неверный логин или пароль"},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        if not user.is_staff:
            return Response(
                {"detail": "Нет прав администратора"},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not user.is_active:
            return Response(
                {"detail": "Учётная запись деактивирована"},
                status=status.HTTP_403_FORBIDDEN,
            )

        tokens = issue_token_pair(user, request)
        return Response(
            {
                **tokens,
                "username": user.username,
                "is_staff": user.is_staff,
                "is_superuser": user.is_superuser,
            }
        )