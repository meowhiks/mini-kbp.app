"""Presence журнала через Redis (fallback — in-memory cache)."""

from __future__ import annotations

import json
import time

from django.core.cache import cache
from django.http import StreamingHttpResponse
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.staff_lock_permission import StaffSessionUnlocked
from academics.journal_views import _teacher_profile, _visible_assignments


PRESENCE_TTL = 8


def _presence_key(assignment_id: int) -> str:
    return f"journal_presence:{assignment_id}"


def _read_peers(assignment_id: int) -> list[dict]:
    raw = cache.get(_presence_key(assignment_id))
    if not raw:
        return []
    try:
        peers = json.loads(raw) if isinstance(raw, str) else raw
    except (TypeError, json.JSONDecodeError):
        return []
    now = time.time()
    return [p for p in peers if now - float(p.get("updated_at", 0)) <= PRESENCE_TTL]


def _write_peers(assignment_id: int, peers: list[dict]) -> None:
    cache.set(_presence_key(assignment_id), json.dumps(peers), timeout=PRESENCE_TTL * 3)


class JournalPresenceHeartbeatView(APIView):
    """POST /v0/journal-presence/heartbeat/"""

    permission_classes = [permissions.IsAuthenticated, StaffSessionUnlocked]

    def post(self, request):
        assignment_id = request.data.get("assignment_id")
        student_id = request.data.get("student_id")
        date = request.data.get("date")
        slot = request.data.get("slot")
        if not assignment_id:
            return Response({"detail": "assignment_id обязателен"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            aid = int(assignment_id)
        except (TypeError, ValueError):
            return Response({"detail": "Некорректный assignment_id"}, status=status.HTTP_400_BAD_REQUEST)

        teacher = _teacher_profile(request.user)
        if not _visible_assignments(request.user, teacher).filter(pk=aid).exists():
            return Response({"detail": "Нет доступа"}, status=status.HTTP_403_FORBIDDEN)

        teacher = _teacher_profile(request.user)
        name = teacher.full_name if teacher else request.user.get_username()
        peer = {
            "user_id": request.user.pk,
            "name": name,
            "student_id": int(student_id) if student_id is not None else None,
            "date": date,
            "slot": int(slot) if slot is not None else None,
            "updated_at": time.time(),
        }
        peers = [p for p in _read_peers(aid) if p.get("user_id") != request.user.pk]
        peers.append(peer)
        _write_peers(aid, peers)
        return Response({"ok": True, "peers": peers})


class JournalPresenceStreamView(APIView):
    """GET /v0/journal-presence/stream/?assignment=<id> — SSE."""

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
        if not _visible_assignments(request.user, teacher).filter(pk=aid).exists():
            return Response({"detail": "Нет доступа"}, status=status.HTTP_403_FORBIDDEN)

        def event_stream():
            for _ in range(60):
                peers = _read_peers(aid)
                yield f"data: {json.dumps({'peers': peers})}\n\n"
                time.sleep(2)

        resp = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
        resp["Cache-Control"] = "no-cache"
        resp["X-Accel-Buffering"] = "no"
        return resp
