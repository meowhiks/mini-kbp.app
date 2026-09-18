"""Регистрация FCM-токенов для push-уведомлений (Django вместо Vercel)."""

from __future__ import annotations

import json

from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import AppAccount, PushDevice
from .permissions import IsStaffUser


class PushRegisterView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        body = request.data if isinstance(request.data, dict) else {}
        if not body and request.body:
            try:
                body = json.loads(request.body.decode("utf-8"))
            except json.JSONDecodeError:
                body = {}

        fcm_token = str(body.get("fcmToken") or "").strip()
        if not fcm_token:
            return Response({"error": "fcmToken required"}, status=status.HTTP_400_BAD_REQUEST)

        kbp_group_id = str(body.get("ejGroupId") or body.get("kbpGroupId") or "").strip()
        group_name = str(body.get("groupName") or "").strip()
        active = body.get("active") is not False

        account = AppAccount.objects.filter(user=request.user).select_related("group").first()
        if not account:
            return Response({"error": "App account required"}, status=status.HTTP_403_FORBIDDEN)

        if active:
            if account.group_id:
                if not kbp_group_id or kbp_group_id == "0":
                    kbp_group_id = str(account.group_id)
                if (not group_name or group_name == "-") and account.group:
                    group_name = str(account.group.name)
            elif not kbp_group_id or kbp_group_id == "0":
                kbp_group_id = f"acc:{account.id}"
                if not group_name or group_name == "-":
                    group_name = (
                        account.display_name
                        or account.nickname
                        or account.email
                        or f"Account {account.id}"
                    )

        if active and (not kbp_group_id or kbp_group_id == "0" or not group_name or group_name == "-"):
            return Response(
                {"error": "ejGroupId и groupName обязательны (или привяжите группу к аккаунту)"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        device_id = str(body.get("deviceId") or "").strip()
        if not device_id:
            import base64

            device_id = base64.urlsafe_b64encode(fcm_token.encode("utf-8")).decode("ascii")[:128]

        platform = str(body.get("platform") or "android").strip().lower()[:16] or "android"

        timetable_cat = str(body.get("timetableCat") or body.get("timetable_cat") or "").strip()[:32]
        timetable_entity_id = str(
            body.get("timetableEntityId") or body.get("timetable_entity_id") or ""
        ).strip()[:64]
        timetable_entity_name = str(
            body.get("timetableEntityName") or body.get("timetable_entity_name") or ""
        ).strip()[:255]
        if not timetable_cat and kbp_group_id and kbp_group_id != "0":
            timetable_cat = "group"
            timetable_entity_id = timetable_entity_id or kbp_group_id
            timetable_entity_name = timetable_entity_name or group_name

        defaults = {
            "fcm_token": fcm_token,
            "kbp_group_id": kbp_group_id,
            "group_name": group_name,
            "notify_timetable": body.get("notifyTimetable") is not False,
            "notify_journal": body.get("notifyJournal") is not False,
            "active": active,
            "platform": platform,
            "account": account,
            "updated_at": timezone.now(),
        }
        if timetable_cat:
            defaults["timetable_cat"] = timetable_cat
        if timetable_entity_id:
            defaults["timetable_entity_id"] = timetable_entity_id
        if timetable_entity_name:
            defaults["timetable_entity_name"] = timetable_entity_name

        PushDevice.objects.update_or_create(
            device_id=device_id,
            defaults=defaults,
        )

        return Response({"ok": True, "id": device_id})


class PushHealthView(APIView):
    """GET /api/push/health/ — статус FCM для админки (staff)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not IsStaffUser().has_permission(request, self):
            return Response({"detail": "Forbidden"}, status=403)

        from accounts.fcm_push import fcm_configured

        total = PushDevice.objects.count()
        active = PushDevice.objects.filter(active=True, platform="android").count()
        linked = PushDevice.objects.filter(active=True, platform="android", account_id__isnull=False).count()
        return Response(
            {
                "firebase_configured": fcm_configured(),
                "devices_total": total,
                "devices_active_android": active,
                "devices_linked_android": linked,
            }
        )
