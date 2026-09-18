"""Список пользователей /app для назначения ролей в админке."""

from django.contrib.auth import get_user_model
from django.db.models import Count, Exists, OuterRef, Q
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.fcm_push import fcm_configured, send_fcm_messages
from accounts.models import AppAccount, AppSession, PushDevice, Student, Teacher

User = get_user_model()


from accounts.permissions import IsStaffUser


def _auth_provider(acc: AppAccount) -> str:
    if acc.telegram_id:
        return "telegram"
    if acc.google_sub:
        return "google"
    if acc.email:
        return "email"
    return "unknown"


def _serialize_app_account(acc: AppAccount, *, has_teacher: bool | None = None, has_student: bool | None = None, android_push_count: int | None = None) -> dict:
    if has_teacher is None:
        has_teacher = Teacher.objects.filter(user_id=acc.user_id).exists()
    if has_student is None:
        has_student = bool(acc.student_id) or Student.objects.filter(user_id=acc.user_id).exists()
    if android_push_count is None:
        android_push_count = PushDevice.objects.filter(
            account_id=acc.id,
            active=True,
            platform="android",
        ).count()

    label = acc.nickname or acc.display_name or acc.email
    if acc.telegram_username:
        label = label or f"@{acc.telegram_username}"
    if not label:
        label = acc.email or f"ID {acc.id}"

    return {
        "id": acc.id,
        "label": label,
        "email": acc.email or "",
        "nickname": acc.nickname or "",
        "display_name": acc.display_name or "",
        "phone": acc.phone or "",
        "gender": acc.gender or "",
        "info": acc.info or "",
        "avatar_url": acc.avatar_url or "",
        "group_id": acc.group_id,
        "group_name": acc.group.name if acc.group_id else None,
        "has_teacher": has_teacher,
        "has_student": has_student,
        "auth_provider": _auth_provider(acc),
        "telegram_username": acc.telegram_username or "",
        "is_active": acc.user.is_active,
        "profile_locked": acc.profile_locked,
        "show_group": acc.show_group,
        "session_ttl_days": acc.session_ttl_days,
        "created_at": acc.created_at.isoformat() if acc.created_at else None,
        "android_push_count": android_push_count,
        "has_android_push": android_push_count > 0,
    }


class AppAccountListView(APIView):
    """
    GET /api/app-accounts/?role=teacher|student|any
    Пользователи, зарегистрированные через /app.
    """

    permission_classes = [permissions.IsAuthenticated, IsStaffUser]

    def get(self, request):
        role = (request.query_params.get("role") or "any").strip().lower()
        teacher_exists = Teacher.objects.filter(user_id=OuterRef("user_id"))
        student_exists = Student.objects.filter(user_id=OuterRef("user_id"))
        qs = (
            AppAccount.objects.select_related("user", "group", "student")
            .annotate(
                _has_teacher=Exists(teacher_exists),
                _has_student_profile=Exists(student_exists),
                _android_push_count=Count(
                    "push_devices",
                    filter=Q(push_devices__active=True, push_devices__platform="android"),
                ),
            )
            .order_by("-created_at")
        )

        items = []
        for acc in qs:
            has_teacher = acc._has_teacher
            has_student = bool(acc.student_id) or acc._has_student_profile

            if role == "teacher" and has_teacher:
                continue
            if role == "student" and has_student:
                continue

            items.append(
                _serialize_app_account(
                    acc,
                    has_teacher=has_teacher,
                    has_student=has_student,
                    android_push_count=getattr(acc, "_android_push_count", 0),
                )
            )

        return Response(items)

    def delete(self, request):
        raw = request.data.get("ids") if isinstance(request.data, dict) else None
        if not isinstance(raw, list) or not raw:
            return Response({"detail": "Передайте ids."}, status=400)
        ids: list[int] = []
        for item in raw:
            try:
                ids.append(int(item))
            except (TypeError, ValueError):
                return Response({"detail": "Некорректный id."}, status=400)

        deleted = 0
        skipped = 0
        for acc in AppAccount.objects.select_related("user").filter(pk__in=ids):
            if acc.user_id == request.user.id:
                skipped += 1
                continue
            if (acc.user.is_staff or acc.user.is_superuser) and not request.user.is_superuser:
                skipped += 1
                continue
            acc.user.delete()
            deleted += 1
        return Response({"ok": True, "deleted": deleted, "skipped": skipped})


class AppAccountDetailView(APIView):
    """GET/PATCH /api/app-accounts/<id>/ — просмотр и редактирование аккаунта."""

    permission_classes = [permissions.IsAuthenticated, IsStaffUser]

    def _get_account(self, pk: int) -> AppAccount | None:
        try:
            return AppAccount.objects.select_related("user", "group", "student").get(pk=pk)
        except AppAccount.DoesNotExist:
            return None

    def get(self, request, pk: int):
        acc = self._get_account(pk)
        if not acc:
            return Response({"detail": "Аккаунт не найден."}, status=404)
        return Response(_serialize_app_account(acc))

    def patch(self, request, pk: int):
        acc = self._get_account(pk)
        if not acc:
            return Response({"detail": "Аккаунт не найден."}, status=404)

        data = request.data or {}
        user = acc.user
        user_fields: list[str] = []
        acc_fields: list[str] = []

        if "is_active" in data:
            active = bool(data["is_active"])
            user.is_active = active
            user_fields.append("is_active")
            if not active:
                AppSession.objects.filter(account=acc, revoked_at__isnull=True).update(revoked_at=timezone.now())

        if "display_name" in data:
            acc.display_name = str(data["display_name"] or "").strip()[:255]
            acc_fields.append("display_name")

        if "nickname" in data:
            acc.nickname = str(data["nickname"] or "").strip()[:64]
            acc_fields.append("nickname")

        if "phone" in data:
            acc.phone = str(data["phone"] or "").strip()[:32]
            acc_fields.append("phone")

        if "gender" in data:
            gender = str(data["gender"] or "").strip()
            allowed = {"", "male", "female", "other"}
            if gender not in allowed:
                return Response({"detail": "Некорректный пол."}, status=400)
            acc.gender = gender
            acc_fields.append("gender")

        if "info" in data:
            acc.info = str(data["info"] or "").strip()[:2000]
            acc_fields.append("info")

        if "show_group" in data:
            acc.show_group = bool(data["show_group"])
            acc_fields.append("show_group")

        if "profile_locked" in data:
            locked = bool(data["profile_locked"])
            acc.profile_locked = locked
            acc_fields.append("profile_locked")
            if locked:
                acc.profile_locked_at = timezone.now()
                acc_fields.append("profile_locked_at")
                teacher = Teacher.objects.filter(user=request.user, is_active=True).first()
                acc.profile_locked_by = teacher
                acc_fields.append("profile_locked_by_id")
            else:
                acc.profile_locked_by_id = None
                acc.profile_locked_at = None
                acc_fields.extend(["profile_locked_by_id", "profile_locked_at"])

        if "session_ttl_days" in data:
            try:
                ttl = int(data["session_ttl_days"])
            except (TypeError, ValueError):
                return Response({"detail": "Некорректный срок сессии."}, status=400)
            if ttl not in (7, 14, 30, 90, 180, 365):
                return Response({"detail": "Недопустимый срок сессии."}, status=400)
            acc.session_ttl_days = ttl
            acc_fields.append("session_ttl_days")

        if "group_id" in data:
            raw = data["group_id"]
            if raw in (None, "", 0, "0"):
                acc.group_id = None
            else:
                try:
                    acc.group_id = int(raw)
                except (TypeError, ValueError):
                    return Response({"detail": "Некорректная группа."}, status=400)
            acc_fields.append("group_id")

        if user_fields:
            user.save(update_fields=user_fields)
        if acc_fields:
            acc.save(update_fields=acc_fields)

        acc.refresh_from_db()
        acc = self._get_account(pk)
        return Response(_serialize_app_account(acc))

    def delete(self, request, pk: int):
        acc = self._get_account(pk)
        if not acc:
            return Response({"detail": "Аккаунт не найден."}, status=404)
        if acc.user_id == request.user.id:
            return Response({"detail": "Нельзя удалить свой аккаунт."}, status=400)
        if (acc.user.is_staff or acc.user.is_superuser) and not request.user.is_superuser:
            return Response({"detail": "Нельзя удалить сотрудника."}, status=403)
        user = acc.user
        user.delete()
        return Response(status=204)


class AppAccountPushNotifyView(APIView):
    """POST /api/app-accounts/<id>/push/ — push на Android устройства аккаунта."""

    permission_classes = [permissions.IsAuthenticated, IsStaffUser]

    def post(self, request, pk: int):
        acc = AppAccount.objects.filter(pk=pk).first()
        if not acc:
            return Response({"detail": "Аккаунт не найден."}, status=404)

        if not fcm_configured():
            return Response({"detail": "Firebase не настроен (FIREBASE_SERVICE_ACCOUNT_JSON)."}, status=503)

        data = request.data or {}
        body = str(data.get("body") or data.get("message") or "").strip()
        if not body:
            return Response({"detail": "Текст уведомления обязателен."}, status=400)
        title = str(data.get("title") or "Администратор").strip() or "Администратор"
        if len(body) > 1000:
            return Response({"detail": "Слишком длинный текст."}, status=400)

        tokens = list(
            PushDevice.objects.filter(account=acc, active=True, platform="android")
            .exclude(fcm_token="")
            .values_list("fcm_token", flat=True)
        )
        if not tokens:
            return Response({"detail": "У аккаунта нет Android-устройств с push."}, status=404)

        sent, failed = send_fcm_messages(tokens, title=title, body=body)
        if sent == 0:
            return Response({"detail": "Не удалось отправить уведомление.", "sent": 0, "failed": failed}, status=502)

        return Response({"ok": True, "sent": sent, "failed": failed, "title": title})
