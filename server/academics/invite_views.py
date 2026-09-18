"""API одноразовых кодов-паролей для назначения роли на /app."""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta

from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Teacher
from .models import CuratorInviteCode, Group, GroupCurator
from .kbp_catalog import KbpTeacher


def _generate_code() -> str:
    for _ in range(20):
        code = "".join(secrets.choice("0123456789ABCDEFGHJKLMNPQRSTUVWXYZ") for _ in range(6))
        if not CuratorInviteCode.objects.filter(code__iexact=code).exists():
            return code
    return secrets.token_hex(3).upper()


def _serialize_invite(invite: CuratorInviteCode) -> dict:
    used = invite.used_by
    kbp = invite.kbp_teacher
    return {
        "id": invite.id,
        "code": invite.code,
        "role": invite.role,
        "group_id": str(invite.group_id) if invite.group_id else None,
        "group_name": invite.group.name if invite.group_id else None,
        "kbp_teacher_id": kbp.id if kbp else None,
        "kbp_teacher_name": kbp.name if kbp else None,
        "kbp_teacher_kbp_id": kbp.kbp_id if kbp else None,
        "expires_at": invite.expires_at.isoformat(),
        "max_uses": invite.max_uses,
        "use_count": invite.use_count,
        "is_active": invite.is_active,
        "used_by_label": used.display_name if used else None,
        "used_at": invite.used_at.isoformat() if invite.used_at else None,
        "created_at": invite.created_at.isoformat(),
    }


def _can_manage_invites(user) -> bool:
    if user.is_staff:
        return True
    teacher = getattr(user, "teacher_profile", None)
    return bool(teacher and teacher.is_active)


def _can_create_invite(user, role: str, group: Group | None) -> bool:
    if user.is_staff:
        return True
    teacher = getattr(user, "teacher_profile", None)
    if not teacher or not teacher.is_active:
        return False
    if role == CuratorInviteCode.Role.TEACHER:
        return False
    if role == CuratorInviteCode.Role.STUDENT and group:
        return GroupCurator.objects.filter(teacher=teacher, group=group).exists()
    return False


def _parse_expires_at(data: dict) -> datetime | None:
    """Дата/время окончания из expires_at (ISO или YYYY-MM-DD) или expires_days."""
    raw = data.get("expires_at")
    if raw:
        dt = parse_datetime(str(raw).strip())
        if dt is None:
            d = parse_date(str(raw).strip()[:10])
            if d:
                dt = datetime.combine(d, datetime.max.time().replace(microsecond=0))
        if dt is not None:
            if timezone.is_naive(dt):
                dt = timezone.make_aware(dt, timezone.get_current_timezone())
            if dt > timezone.now():
                return dt
            return None
    if "expires_days" in data:
        try:
            days = int(data.get("expires_days") or 7)
        except (TypeError, ValueError):
            days = 7
        days = max(1, min(days, 365))
        return timezone.now() + timedelta(days=days)
    return timezone.now() + timedelta(days=7)


def create_role_invite(request, data: dict) -> tuple[CuratorInviteCode | list[CuratorInviteCode] | None, Response | None]:
    """Создать код. Возвращает (invite, error_response)."""
    if not _can_manage_invites(request.user):
        return None, Response({"detail": "Нет прав"}, status=403)

    role = (data.get("role") or CuratorInviteCode.Role.STUDENT).strip().lower()
    if role not in (CuratorInviteCode.Role.STUDENT, CuratorInviteCode.Role.TEACHER):
        return None, Response({"detail": "role: student или teacher"}, status=400)

    group = None
    group_id = data.get("group_id")
    if role == CuratorInviteCode.Role.STUDENT:
        if not group_id:
            return None, Response({"detail": "group_id обязателен для студента"}, status=400)
        try:
            group = Group.objects.get(pk=int(group_id), is_active=True)
        except (Group.DoesNotExist, ValueError, TypeError):
            return None, Response({"detail": "Группа не найдена"}, status=404)
    elif group_id:
        try:
            group = Group.objects.get(pk=int(group_id), is_active=True)
        except (Group.DoesNotExist, ValueError, TypeError):
            return None, Response({"detail": "Группа не найдена"}, status=404)

    kbp_teacher = None
    kbp_teacher_id = data.get("kbp_teacher_id")
    if role == CuratorInviteCode.Role.TEACHER and kbp_teacher_id not in (None, ""):
        try:
            kbp_teacher = KbpTeacher.objects.get(pk=int(kbp_teacher_id), is_active=True)
        except (KbpTeacher.DoesNotExist, ValueError, TypeError):
            return None, Response({"detail": "Преподаватель kbp не найден"}, status=404)
        if Teacher.objects.filter(kbp_teacher=kbp_teacher).exists():
            return None, Response(
                {"detail": "Этот преподаватель kbp уже привязан"},
                status=400,
            )
    elif role != CuratorInviteCode.Role.TEACHER and kbp_teacher_id not in (None, ""):
        return None, Response({"detail": "kbp_teacher_id только для teacher"}, status=400)

    if not _can_create_invite(request.user, role, group):
        return None, Response({"detail": "Нет прав создать этот код"}, status=403)

    teacher = getattr(request.user, "teacher_profile", None)
    creator = teacher if teacher and teacher.is_active else None

    expires_at = _parse_expires_at(data)
    if expires_at is None:
        return None, Response({"detail": "Дата окончания должна быть в будущем"}, status=400)

    try:
        max_uses = int(data.get("max_uses") or 1)
    except (TypeError, ValueError):
        max_uses = 1
    max_uses = max(1, min(max_uses, 255))

    try:
        count = int(data.get("count") or 1)
    except (TypeError, ValueError):
        count = 1
    count = max(1, min(count, 50))

    invites: list[CuratorInviteCode] = []
    for _ in range(count):
        invite = CuratorInviteCode.objects.create(
            role=role,
            group=group,
            kbp_teacher=kbp_teacher,
            code=_generate_code(),
            created_by=creator,
            expires_at=expires_at,
            max_uses=max_uses,
        )
        invites.append(invite)

    if count == 1:
        return invites[0], None
    return invites, None


class RoleInviteCodeView(APIView):
    """GET/POST /api/role-invite-codes/ — список и создание кодов."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not _can_manage_invites(request.user):
            return Response({"detail": "Нет прав"}, status=403)

        qs = CuratorInviteCode.objects.select_related(
            "group", "used_by", "created_by", "kbp_teacher"
        ).order_by("-created_at")
        if not request.user.is_staff:
            teacher = getattr(request.user, "teacher_profile", None)
            qs = qs.filter(created_by=teacher)

        role = request.query_params.get("role")
        if role in ("student", "teacher"):
            qs = qs.filter(role=role)

        if request.query_params.get("active") == "1":
            qs = qs.filter(is_active=True)

        return Response([_serialize_invite(i) for i in qs[:200]])

    def post(self, request):
        result, err = create_role_invite(request, request.data)
        if err:
            return err
        if isinstance(result, list):
            return Response([_serialize_invite(i) for i in result], status=201)
        return Response(_serialize_invite(result), status=201)


def _can_edit_invite(user, invite: CuratorInviteCode) -> bool:
    if not _can_manage_invites(user):
        return False
    if user.is_staff:
        return True
    teacher = getattr(user, "teacher_profile", None)
    return invite.created_by_id == getattr(teacher, "id", None)


class RoleInviteCodeDetailView(APIView):
    """PATCH/DELETE /api/role-invite-codes/<id>/ — правка и отзыв кода."""

    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, pk: int):
        try:
            invite = CuratorInviteCode.objects.select_related("group", "used_by").get(pk=pk)
        except CuratorInviteCode.DoesNotExist:
            return Response({"detail": "Код не найден"}, status=404)

        if not _can_edit_invite(request.user, invite):
            return Response({"detail": "Нет прав"}, status=403)

        data = request.data
        update_fields: list[str] = []

        if "is_active" in data:
            invite.is_active = bool(data["is_active"])
            update_fields.append("is_active")

        if "max_uses" in data:
            try:
                max_uses = int(data["max_uses"])
            except (TypeError, ValueError):
                return Response({"detail": "max_uses: число"}, status=400)
            max_uses = max(1, min(max_uses, 255))
            if max_uses < invite.use_count:
                return Response({"detail": "max_uses меньше числа использований"}, status=400)
            invite.max_uses = max_uses
            if invite.use_count < invite.max_uses and invite.expires_at > timezone.now():
                invite.is_active = True
                if "is_active" not in update_fields:
                    update_fields.append("is_active")
            update_fields.append("max_uses")

        if "expires_at" in data or "expires_days" in data:
            expires_at = _parse_expires_at(data)
            if expires_at is None:
                return Response({"detail": "Дата окончания должна быть в будущем"}, status=400)
            invite.expires_at = expires_at
            update_fields.append("expires_at")
            if invite.use_count < invite.max_uses:
                invite.is_active = True
                if "is_active" not in data:
                    update_fields.append("is_active")

        if "group_id" in data and invite.use_count == 0:
            if invite.role != CuratorInviteCode.Role.STUDENT:
                return Response({"detail": "group_id только для студента"}, status=400)
            gid = data.get("group_id")
            if not gid:
                return Response({"detail": "group_id обязателен"}, status=400)
            try:
                group = Group.objects.get(pk=int(gid), is_active=True)
            except (Group.DoesNotExist, ValueError, TypeError):
                return Response({"detail": "Группа не найдена"}, status=404)
            if not _can_create_invite(request.user, invite.role, group):
                return Response({"detail": "Нет прав создать этот код"}, status=403)
            invite.group = group
            update_fields.append("group")

        if not update_fields:
            return Response({"detail": "Нечего обновлять"}, status=400)

        invite.save(update_fields=list(dict.fromkeys(update_fields)))
        return Response(_serialize_invite(invite))

    def delete(self, request, pk: int):
        try:
            invite = CuratorInviteCode.objects.get(pk=pk)
        except CuratorInviteCode.DoesNotExist:
            return Response({"detail": "Код не найден"}, status=404)

        if not _can_edit_invite(request.user, invite):
            return Response({"detail": "Нет прав"}, status=403)

        invite.is_active = False
        invite.save(update_fields=["is_active"])
        return Response(status=204)
