"""Нормализация сырого OCR листа замен расписания.

Vision возвращает сырые ячейки (галочки как √). event_type и carry-forward
считаются только здесь.
"""

from __future__ import annotations

import re
from typing import Any

CHECKMARK_TOKENS = frozenset({"√", "V", "v", "✓", "√.", "v.", "V."})
CHECKMARK_SENTINEL = "__CHECKMARK__"
CANCEL_PHRASE = "урок снят"

EVENT_NEW = "NEW_LESSON"
EVENT_CANCEL = "CANCELLATION"
EVENT_REPLACE = "REPLACEMENT"

_DATE_RE = re.compile(
    r"(?P<d>\d{1,2})[.\-/](?P<m>\d{1,2})[.\-/](?P<y>\d{2,4})\s*г?\.?",
    re.IGNORECASE,
)
_LESSON_RANGE_RE = re.compile(r"^\s*(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*$")
_LESSON_SINGLE_RE = re.compile(r"^\s*(\d{1,2})\s*$")


def is_checkmark(value: Any) -> bool:
    if value is None:
        return False
    s = str(value).strip()
    if not s:
        return False
    if s == CHECKMARK_SENTINEL:
        return True
    return s in CHECKMARK_TOKENS


def normalize_cell_token(value: Any) -> str | None:
    """Пустое → None; галочка → sentinel; иначе обрезанная строка."""
    if value is None:
        return None
    if isinstance(value, (list, tuple)):
        return None
    s = str(value).strip()
    if not s:
        return None
    if is_checkmark(s):
        return CHECKMARK_SENTINEL
    return s


def parse_sheet_date(raw: Any, *, default_century: int = 2000) -> str | None:
    """`04.09.26г.` → `2026-09-04`."""
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        return s
    m = _DATE_RE.search(s)
    if not m:
        return None
    d = int(m.group("d"))
    mo = int(m.group("m"))
    y = int(m.group("y"))
    if y < 100:
        y = default_century + y
    try:
        from datetime import date

        return date(y, mo, d).isoformat()
    except ValueError:
        return None


def expand_lesson_numbers(raw: Any) -> list[int]:
    """`9-10` / `9–10` / `7` → [9, 10] / [7]."""
    if raw is None:
        return []
    if isinstance(raw, int):
        return [raw] if raw > 0 else []
    if isinstance(raw, float):
        n = int(raw)
        return [n] if n > 0 else []
    s = str(raw).strip()
    if not s:
        return []
    m = _LESSON_RANGE_RE.match(s)
    if m:
        a, b = int(m.group(1)), int(m.group(2))
        if a > b:
            a, b = b, a
        return list(range(a, b + 1))
    m2 = _LESSON_SINGLE_RE.match(s)
    if m2:
        n = int(m2.group(1))
        return [n] if n > 0 else []
    # "7,8" or "7 8"
    parts = re.split(r"[,;/+\s]+", s)
    out: list[int] = []
    for p in parts:
        if not p:
            continue
        m3 = _LESSON_SINGLE_RE.match(p)
        if m3:
            n = int(m3.group(1))
            if n > 0 and n not in out:
                out.append(n)
    return out


def _empty_block() -> dict[str, Any]:
    return {"subject": None, "room": None, "teachers": []}


def _teachers_list(raw: Any) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, str):
        t = normalize_cell_token(raw)
        if t is None or t == CHECKMARK_SENTINEL:
            return []
        parts = [p.strip() for p in re.split(r"[,;/]+", t) if p.strip()]
        return parts
    if isinstance(raw, (list, tuple)):
        out: list[str] = []
        for item in raw:
            t = normalize_cell_token(item)
            if t and t != CHECKMARK_SENTINEL:
                out.append(t)
        return out
    t = normalize_cell_token(raw)
    return [t] if t and t != CHECKMARK_SENTINEL else []


def _parse_block(raw: Any) -> dict[str, Any]:
    """Сырой блок {subject, room, teachers} с токенами галочек."""
    if not isinstance(raw, dict):
        return _empty_block()
    subject = normalize_cell_token(raw.get("subject"))
    room = normalize_cell_token(raw.get("room"))
    teachers_raw = raw.get("teachers")
    if teachers_raw is None and "teacher" in raw:
        teachers_raw = raw.get("teacher")

    # Галочка в teachers: один sentinel в списке
    if isinstance(teachers_raw, str) and is_checkmark(teachers_raw):
        teachers: list[str] | str = CHECKMARK_SENTINEL
    elif isinstance(teachers_raw, (list, tuple)) and len(teachers_raw) == 1 and is_checkmark(teachers_raw[0]):
        teachers = CHECKMARK_SENTINEL
    else:
        teachers = _teachers_list(teachers_raw)

    return {
        "subject": subject,
        "room": room,
        "teachers": teachers,
    }


def _is_cancel_subject(subject: Any) -> bool:
    if subject is None:
        return False
    s = str(subject).strip().lower().replace("ё", "е")
    s = re.sub(r"\s+", " ", s)
    return CANCEL_PHRASE in s


def _apply_carry_forward(block: dict[str, Any], prev: dict[str, Any] | None) -> dict[str, Any]:
    """√ в replacement → значение из предыдущей строки той же группы."""
    if prev is None:
        prev = _empty_block()
    subject = block.get("subject")
    room = block.get("room")
    teachers = block.get("teachers")

    if subject == CHECKMARK_SENTINEL:
        subject = prev.get("subject")
    if room == CHECKMARK_SENTINEL:
        room = prev.get("room")
    if teachers == CHECKMARK_SENTINEL:
        teachers = list(prev.get("teachers") or [])
    elif not isinstance(teachers, list):
        teachers = _teachers_list(teachers)

    return {
        "subject": None if subject == CHECKMARK_SENTINEL else subject,
        "room": None if room == CHECKMARK_SENTINEL else room,
        "teachers": teachers if isinstance(teachers, list) else [],
    }


def _apply_original_checkmarks(block: dict[str, Any]) -> dict[str, Any]:
    """√ в original → урока не было (null)."""
    subject = block.get("subject")
    room = block.get("room")
    teachers = block.get("teachers")

    if subject == CHECKMARK_SENTINEL:
        subject = None
    if room == CHECKMARK_SENTINEL:
        room = None
    if teachers == CHECKMARK_SENTINEL:
        teachers = []
    elif not isinstance(teachers, list):
        teachers = _teachers_list(teachers)

    return {
        "subject": subject,
        "room": room,
        "teachers": teachers if isinstance(teachers, list) else [],
    }


def _has_replacement_content(replacement: dict[str, Any]) -> bool:
    return bool(
        replacement.get("subject") or replacement.get("room") or replacement.get("teachers")
    )


def _classify_event(replacement: dict[str, Any], _original: dict[str, Any] | None = None) -> str | None:
    """Лист даёт только «что ставим». Было — из расписания по группе+№ пары.

    Returns None → строку пропускаем (пустая после √ без предыдущей).
    """
    if _is_cancel_subject(replacement.get("subject")):
        return EVENT_CANCEL
    if _has_replacement_content(replacement):
        # Не NEW_LESSON: оверлей подменяет пару по group+lesson.
        return EVENT_REPLACE
    return None


def _finalize_cancel(replacement: dict[str, Any], original: dict[str, Any]) -> tuple[dict, dict]:
    """CANCELLATION: replacement пустой. original на листе не обязателен."""
    return _empty_block(), {
        "subject": original.get("subject")
        if original.get("subject") and not _is_cancel_subject(original.get("subject"))
        else None,
        "room": original.get("room"),
        "teachers": list(original.get("teachers") or []),
    }


def normalize_ocr_replacements(payload: dict[str, Any]) -> dict[str, Any]:
    """Сырой OCR JSON → schedule_info + replacements[] с event_type."""
    if not isinstance(payload, dict):
        payload = {}

    info_in = payload.get("schedule_info") if isinstance(payload.get("schedule_info"), dict) else {}
    date_raw = info_in.get("date") or payload.get("date")
    schedule_info = {
        "day_of_week": (str(info_in.get("day_of_week") or payload.get("day_of_week") or "").strip() or None),
        "date": parse_sheet_date(date_raw) or (str(date_raw).strip() if date_raw and re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(date_raw).strip()) else None),
        "signed_by": (str(info_in.get("signed_by") or "").strip() or None),
    }

    rows_in = payload.get("replacements")
    if not isinstance(rows_in, list):
        rows_in = payload.get("rows") if isinstance(payload.get("rows"), list) else []

    # Сначала разворачиваем lesson ranges; порядок строк сохраняем для carry-forward.
    expanded: list[dict[str, Any]] = []
    for row in rows_in:
        if not isinstance(row, dict):
            continue
        group = str(row.get("group_code") or row.get("group") or "").strip()
        lessons = expand_lesson_numbers(row.get("lesson_number") or row.get("lesson") or row.get("pair"))
        if not lessons:
            continue
        repl_raw = row.get("replacement_data") or row.get("replacement") or {}
        # Колонка «было» на листе не нужна — плоская строка: группа, урок, предмет, ауд, препод
        if not isinstance(repl_raw, dict) or (
            not repl_raw and any(k in row for k in ("subject", "room", "teacher", "teachers"))
        ):
            repl_raw = {
                "subject": row.get("new_subject") or row.get("subject"),
                "room": row.get("new_room") or row.get("room"),
                "teachers": row.get("new_teachers") or row.get("teachers") or row.get("teacher"),
            }
        # original игнорируем при чтении листа (оставляем пустым)
        orig_raw: dict[str, Any] = {}

        for lesson in lessons:
            expanded.append(
                {
                    "group_code": group,
                    "lesson_number": lesson,
                    "replacement_data": _parse_block(repl_raw if isinstance(repl_raw, dict) else {}),
                    "original_data": _parse_block(orig_raw if isinstance(orig_raw, dict) else {}),
                }
            )

    out_rows: list[dict[str, Any]] = []
    # prev replacement block per group (after carry-forward resolution)
    last_repl_by_group: dict[str, dict[str, Any]] = {}

    for row in expanded:
        group = row["group_code"]
        prev = last_repl_by_group.get(group)
        replacement = _apply_carry_forward(row["replacement_data"], prev)
        original = _apply_original_checkmarks(row["original_data"])

        if _is_cancel_subject(replacement.get("subject")):
            event_type = EVENT_CANCEL
            replacement, original = _finalize_cancel(replacement, original)
        else:
            event_type = _classify_event(replacement, original)
            if event_type is None:
                continue
            if event_type == EVENT_CANCEL:
                replacement, original = _finalize_cancel(replacement, original)

        # Обновляем carry-forward только если есть осмысленный replacement (не cancel)
        if event_type != EVENT_CANCEL and _has_replacement_content(replacement):
            last_repl_by_group[group] = {
                "subject": replacement.get("subject"),
                "room": replacement.get("room"),
                "teachers": list(replacement.get("teachers") or []),
            }

        out_rows.append(
            {
                "group_code": group,
                "lesson_number": int(row["lesson_number"]),
                "event_type": event_type,
                "replacement_data": {
                    "subject": replacement.get("subject"),
                    "room": replacement.get("room"),
                    "teachers": list(replacement.get("teachers") or []),
                },
                "original_data": {
                    "subject": original.get("subject"),
                    "room": original.get("room"),
                    "teachers": list(original.get("teachers") or []),
                },
            }
        )

    return {"schedule_info": schedule_info, "replacements": out_rows}
