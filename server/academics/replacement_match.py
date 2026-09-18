"""Матч OCR-строк с каталогом Kbp*."""

from __future__ import annotations

import re
from typing import Any

from academics.kbp_catalog import KbpGroup, KbpPlace, KbpSubject, KbpTeacher

_ROOM_PREFIX_RE = re.compile(
    r"^(?:ауд\.?|аудитория|каб\.?|кабинет)\s*",
    re.IGNORECASE,
)


def _norm_name(s: str) -> str:
    s = (s or "").strip().lower().replace("ё", "е")
    s = re.sub(r"\s+", " ", s)
    return s


def normalize_room_token(room: str | None) -> str | None:
    """`ауд. 410` / `Ауд.410` → `410`; пустое → None."""
    if room is None:
        return None
    r = str(room).strip()
    if not r:
        return None
    r = _ROOM_PREFIX_RE.sub("", r).strip()
    return r or None


def _group_compact(name: str) -> str:
    """П-491 / 491-П → п491 / 491п (без дефисов, lower)."""
    s = (name or "").strip().lower().replace("ё", "е")
    return re.sub(r"[\s\-–—]+", "", s)


def group_identity(name: str) -> str:
    """Канон для матча: П-491 / п491 / 491П / 491-п → `491п`.

    Одна буква (prefix или suffix) + цифры → `{digits}{letter}`.
    Иначе — просто compact.
    """
    compact = _group_compact(name)
    if not compact:
        return ""
    m = re.fullmatch(r"([а-яa-z]*)(\d+)([а-яa-z]*)", compact)
    if not m:
        return compact
    prefix, digits, suffix = m.group(1), m.group(2), m.group(3)
    if prefix and suffix:
        return compact
    letter = prefix or suffix
    return f"{digits}{letter}" if letter else digits


def match_kbp_group(group_code: str) -> KbpGroup | None:
    code = (group_code or "").strip()
    if not code:
        return None
    exact = KbpGroup.objects.filter(is_active=True, name__iexact=code).first()
    if exact:
        return exact
    # П-491 ↔ 491П ↔ 491п ↔ 491-П
    identity = group_identity(code)
    compact = _group_compact(code)
    for g in KbpGroup.objects.filter(is_active=True).only("id", "name"):
        if group_identity(g.name) == identity:
            return g
        if _group_compact(g.name) == compact:
            return g
    return KbpGroup.objects.filter(is_active=True, name__icontains=code).first()


def match_kbp_subject(name: str | None) -> KbpSubject | None:
    if not name:
        return None
    n = _norm_name(name)
    exact = KbpSubject.objects.filter(is_active=True, name__iexact=name.strip()).first()
    if exact:
        return exact
    for s in KbpSubject.objects.filter(is_active=True).only("id", "name"):
        if _norm_name(s.name) == n:
            return s
        if n in _norm_name(s.name) or _norm_name(s.name) in n:
            return s
    return None


def match_kbp_place(room: str | None) -> KbpPlace | None:
    if not room:
        return None
    candidates = []
    raw = str(room).strip()
    if raw:
        candidates.append(raw)
    cleaned = normalize_room_token(raw)
    if cleaned and cleaned not in candidates:
        candidates.append(cleaned)

    for cand in candidates:
        hit = (
            KbpPlace.objects.filter(is_active=True, name__iexact=cand).first()
            or KbpPlace.objects.filter(is_active=True, name__icontains=cand).first()
        )
        if hit:
            return hit
        # каталог «410», OCR «ауд. 410» уже в candidates; ещё: число из строки
        digits = re.search(r"\d+[а-яa-z]?", cand, re.IGNORECASE)
        if digits:
            num = digits.group(0)
            if num != cand:
                hit = KbpPlace.objects.filter(is_active=True, name__iexact=num).first()
                if hit:
                    return hit
    return None


def match_kbp_teacher(name: str | None) -> KbpTeacher | None:
    if not name:
        return None
    n = _norm_name(name)
    exact = KbpTeacher.objects.filter(is_active=True, name__iexact=name.strip()).first()
    if exact:
        return exact
    # Фамилия + инициалы
    for t in KbpTeacher.objects.filter(is_active=True).only("id", "name"):
        tn = _norm_name(t.name)
        if tn == n or tn.startswith(n) or n.startswith(tn.split()[0] if tn else ""):
            if tn.split()[0] == n.split()[0]:
                return t
    return KbpTeacher.objects.filter(is_active=True, name__icontains=name.strip().split()[0]).first()


def apply_catalog_match(entry_fields: dict[str, Any]) -> dict[str, Any]:
    """Добавляет kbp_* id в dict полей Entry (не сохраняет)."""
    group = match_kbp_group(str(entry_fields.get("group_code") or ""))
    repl = entry_fields.get("replacement_data") or {}
    if not isinstance(repl, dict):
        repl = {}
    subject_name = repl.get("subject")
    room = repl.get("room")
    teachers = repl.get("teachers") or []
    teacher_name = teachers[0] if isinstance(teachers, list) and teachers else None

    # Для отмены матчим original
    if entry_fields.get("event_type") == "CANCELLATION":
        orig = entry_fields.get("original_data") or {}
        if isinstance(orig, dict):
            subject_name = orig.get("subject") or subject_name
            room = orig.get("room") or room
            ot = orig.get("teachers") or []
            if isinstance(ot, list) and ot:
                teacher_name = ot[0]

    out = dict(entry_fields)
    out["kbp_group"] = group
    out["kbp_subject"] = match_kbp_subject(subject_name if isinstance(subject_name, str) else None)
    out["kbp_place"] = match_kbp_place(room if isinstance(room, str) else None)
    out["kbp_teacher"] = match_kbp_teacher(teacher_name if isinstance(teacher_name, str) else None)
    return out
