"""Push при публикации замен расписания."""

from __future__ import annotations

import logging
from typing import Any

from accounts.models import PushDevice
from academics.grade_notifications import format_replacement_push
from academics.replacement_match import group_identity
from academics.replacements import ReplacementEntry, ReplacementScanBatch

logger = logging.getLogger(__name__)


def _names_same_group(a: str, b: str) -> bool:
    if not a or not b:
        return False
    if a.lower() == b.lower():
        return True
    return group_identity(a) == group_identity(b) and bool(group_identity(a))


def _entry_matches_device(entry: ReplacementEntry, device: PushDevice) -> bool:
    cat = (getattr(device, "timetable_cat", None) or "").strip().lower()
    entity_id = (getattr(device, "timetable_entity_id", None) or "").strip()
    group_name = (device.group_name or "").strip()
    kbp_gid = (device.kbp_group_id or "").strip()
    entity_name = (getattr(device, "timetable_entity_name", None) or "").strip()

    # Legacy: device tied to group via kbp_group_id / group_name
    if entry.kbp_group_id and entry.kbp_group:
        if kbp_gid and kbp_gid == entry.kbp_group.kbp_id:
            return True
        if _names_same_group(group_name, entry.group_code or ""):
            return True
        if _names_same_group(group_name, entry.kbp_group.name or ""):
            return True

    if not cat or not entity_id:
        # Fallback: match group_code to group_name
        if _names_same_group(group_name, entry.group_code or ""):
            return True
        if kbp_gid and entry.kbp_group and kbp_gid == entry.kbp_group.kbp_id:
            return True
        return False

    if cat in ("group", "групп", "группы"):
        if entry.kbp_group and entity_id == entry.kbp_group.kbp_id:
            return True
        if _names_same_group(entity_id, entry.group_code or ""):
            return True
        if _names_same_group(entity_name, entry.group_code or ""):
            return True
        if entry.kbp_group and _names_same_group(entity_name, entry.kbp_group.name or ""):
            return True
        return False

    repl = entry.replacement_data or {}
    orig = entry.original_data or {}

    if cat in ("teacher", "преподаватель", "преподаватели"):
        if entry.kbp_teacher_id and str(entry.kbp_teacher.kbp_id) == entity_id:
            return True
        names = list(repl.get("teachers") or []) + list(orig.get("teachers") or [])
        entity_name = (getattr(device, "timetable_entity_name", None) or device.group_name or "").lower()
        return any(entity_name and entity_name in str(n).lower() for n in names)

    if cat in ("place", "аудитория", "аудитории"):
        if entry.kbp_place_id and str(entry.kbp_place.kbp_id) == entity_id:
            return True
        rooms = [repl.get("room"), orig.get("room")]
        entity_name = (getattr(device, "timetable_entity_name", None) or "").lower()
        return any(entity_name and str(r).lower() == entity_name for r in rooms if r)

    if cat in ("subject", "предмет", "предметы"):
        if entry.kbp_subject_id and str(entry.kbp_subject.kbp_id) == entity_id:
            return True
        subjects = [repl.get("subject"), orig.get("subject")]
        entity_name = (getattr(device, "timetable_entity_name", None) or "").lower()
        return any(entity_name and entity_name in str(s).lower() for s in subjects if s)

    return False


def _format_entry_push(entry: ReplacementEntry) -> tuple[str, str]:
    repl = entry.replacement_data or {}
    orig = entry.original_data or {}
    if entry.event_type == ReplacementEntry.EventType.CANCELLATION:
        subj = (orig.get("subject") or "занятие").strip() or "занятие"
        return f"Урок снят ({entry.lesson_number})", f"{entry.group_code}: {subj}"
    if entry.event_type == ReplacementEntry.EventType.NEW_LESSON:
        neu = (repl.get("subject") or "Новый урок").strip()
        return f"Новый урок {entry.lesson_number}", f"{entry.group_code}: {neu}"
    return format_replacement_push(
        pair_number=int(entry.lesson_number),
        new_name=str(repl.get("subject") or "Замена"),
        old_name=str(orig.get("subject") or "занятие"),
    )


def notify_replacements_published(batch: ReplacementScanBatch) -> None:
    entries = list(
        batch.entries.select_related("kbp_group", "kbp_teacher", "kbp_place", "kbp_subject")
    )
    if not entries:
        return

    devices = list(
        PushDevice.objects.filter(active=True, notify_timetable=True)
        .exclude(fcm_token="")
        .select_related()
    )
    if not devices:
        return

    # token -> list of (title, body) max 3
    per_token: dict[str, list[tuple[str, str]]] = {}
    for device in devices:
        matched = [e for e in entries if _entry_matches_device(e, device)]
        if not matched:
            continue
        msgs = [_format_entry_push(e) for e in matched[:3]]
        per_token.setdefault(device.fcm_token, [])
        # keep first up to 3 unique
        existing = per_token[device.fcm_token]
        for m in msgs:
            if len(existing) >= 3:
                break
            if m not in existing:
                existing.append(m)

    if not per_token:
        return

    try:
        from accounts.fcm_push import fcm_configured, send_fcm_messages

        if not fcm_configured():
            logger.info("Skip replacement FCM: Firebase not configured")
            return
        for token, msgs in per_token.items():
            title, body = msgs[0]
            if len(msgs) > 1:
                body = body + f" (+ ещё {len(msgs) - 1})"
            send_fcm_messages([token], title=title, body=body, source="timetable")
    except Exception as exc:
        logger.warning("Replacement FCM failed: %s", exc)
