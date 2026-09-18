"""Парсинг и синхронизация каталога расписания kbp.by."""

from __future__ import annotations

import re
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Callable, Iterable
from html import unescape

from django.db import transaction
from django.utils import timezone

from academics.kbp_catalog import (
    KbpGroup,
    KbpPlace,
    KbpSubject,
    KbpTeacher,
    KbpTeachingLink,
)

KBP_SEARCH_URL = "https://kbp.by/rasp/timetable/view_beta_kbp/?q="
KBP_GROUP_URL = (
    "https://kbp.by/rasp/timetable/view_beta_kbp/?page=stable&cat=group&id={id}"
)
DEFAULT_UA = (
    "Mozilla/5.0 (compatible; MiniKBP/1.0; +https://mini-kbp.site) "
    "AppleWebKit/537.36 (KHTML, like Gecko)"
)

SEARCH_ITEM_RE = re.compile(
    r'<div[^>]*>\s*(?:<span class="type_find">([^<]+)</span>\s*)?'
    r'<a[^>]*href="[^"]*\?cat=(group|teacher|place|subject)(?:&amp;|&)id=([^"&]+)[^"]*">'
    r"([^<]+)</a>\s*</div>",
    re.IGNORECASE,
)

SUBJECT_REF_RE = re.compile(
    r'<div[^>]*class="[^"]*subject[^"]*"[^>]*>[\s\S]*?'
    r'<a[^>]*href="[^"]*\?cat=subject(?:&amp;|&)id=(\d+)[^"]*"[^>]*>([^<]+)</a>',
    re.IGNORECASE,
)
TEACHER_REF_RE = re.compile(
    r'<a[^>]*href="[^"]*\?cat=teacher(?:&amp;|&)id=(\d+)[^"]*"[^>]*>([^<]*)</a>',
    re.IGNORECASE,
)
PLACE_REF_RE = re.compile(
    r'<a[^>]*href="[^"]*\?cat=place(?:&amp;|&)id=(\d+)[^"]*"[^>]*>([^<]+)</a>',
    re.IGNORECASE,
)
GROUP_REF_RE = re.compile(
    r'<a[^>]*href="[^"]*\?cat=group(?:&amp;|&)id=(\d+)[^"]*"[^>]*>([^<]+)</a>',
    re.IGNORECASE,
)
PAIR_BLOCK_RE = re.compile(
    r'<div[^>]*class="[^"]*\bpair\b[^"]*"[^>]*>([\s\S]*?)</div>\s*(?=<div[^>]*class="[^"]*\bpair\b|$)',
    re.IGNORECASE,
)


@dataclass(frozen=True)
class SearchEntity:
    kind: str  # group | teacher | place | subject
    kbp_id: str
    name: str


@dataclass(frozen=True)
class PairRefs:
    subject_id: str | None
    subject_name: str | None
    teacher_ids: tuple[tuple[str, str], ...]  # (id, name)
    place_id: str | None
    place_name: str | None
    group_id: str | None
    group_name: str | None


@dataclass
class SyncStats:
    entities_upserted: int = 0
    entities_deactivated: int = 0
    links_upserted: int = 0
    groups_fetched: int = 0
    errors: list[str] | None = None

    def __post_init__(self) -> None:
        if self.errors is None:
            self.errors = []


def _clean_name(value: str) -> str:
    return unescape((value or "").strip())


def parse_search_index(html: str) -> list[SearchEntity]:
    """Разбор find_block / всей страницы ?q=."""
    if not html:
        return []
    # Берём содержимое после find_block, если есть; иначе весь HTML.
    # Не режем по первому </div></div> — вложенные пункты ломают non-greedy.
    find_start = re.search(r'<div class="find_block"[^>]*>', html, re.IGNORECASE)
    block = html[find_start.end() :] if find_start else html
    seen: set[str] = set()
    out: list[SearchEntity] = []
    for match in SEARCH_ITEM_RE.finditer(block):
        kind = match.group(2).strip().lower()
        kbp_id = match.group(3).strip()
        name = _clean_name(match.group(4))
        if not kind or not kbp_id or not name:
            continue
        key = f"{kind}:{kbp_id}"
        if key in seen:
            continue
        seen.add(key)
        out.append(SearchEntity(kind=kind, kbp_id=kbp_id, name=name))
    return out


def parse_pair_refs(html: str) -> list[PairRefs]:
    """Извлечь subject/teacher/place/group refs из HTML страницы группы."""
    if not html:
        return []
    # Более устойчиво: ищем блоки с class содержащим pair
    pairs: list[PairRefs] = []
    # Разбиваем по открывающим pair-div (включая вложенность упрощённо через subject anchors)
    for subject_m in SUBJECT_REF_RE.finditer(html):
        # Берём окно вокруг subject для связанных teacher/place/group
        start = max(0, subject_m.start() - 200)
        end = min(len(html), subject_m.end() + 2500)
        window = html[start:end]
        teachers = []
        seen_t: set[str] = set()
        for tm in TEACHER_REF_RE.finditer(window):
            tid = tm.group(1).strip()
            tname = _clean_name(tm.group(2))
            if tid and tname and tid not in seen_t:
                seen_t.add(tid)
                teachers.append((tid, tname))
        place_m = PLACE_REF_RE.search(window)
        group_m = GROUP_REF_RE.search(window)
        pairs.append(
            PairRefs(
                subject_id=subject_m.group(1).strip(),
                subject_name=_clean_name(subject_m.group(2)),
                teacher_ids=tuple(teachers),
                place_id=place_m.group(1).strip() if place_m else None,
                place_name=_clean_name(place_m.group(2)) if place_m else None,
                group_id=group_m.group(1).strip() if group_m else None,
                group_name=_clean_name(group_m.group(2)) if group_m else None,
            )
        )
    return pairs


def fetch_url(url: str, timeout: float = 30.0) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "User-Agent": DEFAULT_UA,
        },
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
        charset = resp.headers.get_content_charset() or "utf-8"
        return raw.decode(charset, errors="replace")


def _upsert_entity(kind: str, kbp_id: str, name: str, dry_run: bool) -> bool:
    model_map = {
        "group": KbpGroup,
        "teacher": KbpTeacher,
        "subject": KbpSubject,
        "place": KbpPlace,
    }
    model = model_map[kind]
    if dry_run:
        return not model.objects.filter(kbp_id=kbp_id).exists()
    obj, created = model.objects.update_or_create(
        kbp_id=kbp_id,
        defaults={"name": name, "is_active": True},
    )
    return created or True


def sync_entities_from_index(
    entities: Iterable[SearchEntity],
    *,
    dry_run: bool = False,
) -> SyncStats:
    stats = SyncStats()
    by_kind: dict[str, set[str]] = {
        "group": set(),
        "teacher": set(),
        "subject": set(),
        "place": set(),
    }
    for ent in entities:
        if ent.kind not in by_kind:
            continue
        by_kind[ent.kind].add(ent.kbp_id)
        _upsert_entity(ent.kind, ent.kbp_id, ent.name, dry_run=dry_run)
        stats.entities_upserted += 1

    if dry_run:
        return stats

    model_map = {
        "group": KbpGroup,
        "teacher": KbpTeacher,
        "subject": KbpSubject,
        "place": KbpPlace,
    }
    for kind, ids in by_kind.items():
        if not ids:
            continue
        deactivated = (
            model_map[kind]
            .objects.filter(is_active=True)
            .exclude(kbp_id__in=ids)
            .update(is_active=False)
        )
        stats.entities_deactivated += deactivated
    return stats


def ensure_named(
    model,
    kbp_id: str | None,
    name: str | None,
    *,
    dry_run: bool,
):
    if not kbp_id or not name:
        return None
    if dry_run:
        return None
    obj, _ = model.objects.update_or_create(
        kbp_id=kbp_id,
        defaults={"name": name, "is_active": True},
    )
    return obj


def sync_links_for_group(
    group: KbpGroup,
    html: str,
    *,
    dry_run: bool = False,
) -> int:
    """Upsert KbpTeachingLink из HTML страницы группы. Возвращает число троек."""
    count = 0
    seen: set[tuple[str, str, str]] = set()
    for refs in parse_pair_refs(html):
        if not refs.subject_id or not refs.teacher_ids:
            continue
        subject = ensure_named(
            KbpSubject, refs.subject_id, refs.subject_name, dry_run=dry_run
        )
        place = ensure_named(KbpPlace, refs.place_id, refs.place_name, dry_run=dry_run)
        # группа страницы — основная; ref.group может совпадать
        group_obj = group
        if refs.group_id and refs.group_id != group.kbp_id:
            alt = ensure_named(
                KbpGroup, refs.group_id, refs.group_name or refs.group_id, dry_run=dry_run
            )
            if alt is not None:
                group_obj = alt
        for tid, tname in refs.teacher_ids:
            key = (tid, group_obj.kbp_id if hasattr(group_obj, "kbp_id") else group.kbp_id, refs.subject_id)
            if key in seen:
                continue
            seen.add(key)
            count += 1
            if dry_run:
                continue
            teacher = ensure_named(KbpTeacher, tid, tname, dry_run=False)
            if not teacher or not subject:
                continue
            KbpTeachingLink.objects.update_or_create(
                teacher=teacher,
                group=group_obj,
                subject=subject,
                defaults={
                    "place": place,
                    "source": "timetable",
                    "last_seen_at": timezone.now(),
                },
            )
    return count


FetchFn = Callable[[str], str]


def run_sync(
    *,
    entities_only: bool = False,
    limit: int | None = None,
    dry_run: bool = False,
    delay_sec: float = 0.4,
    fetch: FetchFn | None = None,
) -> SyncStats:
    fetch_fn = fetch or fetch_url
    stats = SyncStats()

    try:
        index_html = fetch_fn(KBP_SEARCH_URL)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        stats.errors.append(f"index fetch failed: {exc}")
        return stats

    entities = parse_search_index(index_html)
    ent_stats = sync_entities_from_index(entities, dry_run=dry_run)
    stats.entities_upserted = ent_stats.entities_upserted
    stats.entities_deactivated = ent_stats.entities_deactivated

    if entities_only:
        return stats

    groups = list(KbpGroup.objects.filter(is_active=True).order_by("name"))
    if dry_run:
        # в dry-run групп может ещё не быть в БД — берём из индекса
        group_ids = [e for e in entities if e.kind == "group"]
        if limit is not None:
            group_ids = group_ids[:limit]
        for g in group_ids:
            try:
                html = fetch_fn(KBP_GROUP_URL.format(id=g.kbp_id))
            except (urllib.error.URLError, TimeoutError, OSError) as exc:
                stats.errors.append(f"group {g.kbp_id}: {exc}")
                continue
            stats.groups_fetched += 1
            # mock group for link count
            fake = KbpGroup(kbp_id=g.kbp_id, name=g.name)
            stats.links_upserted += sync_links_for_group(fake, html, dry_run=True)
            if delay_sec > 0:
                time.sleep(delay_sec)
        return stats

    if limit is not None:
        groups = groups[:limit]

    for group in groups:
        try:
            html = fetch_fn(KBP_GROUP_URL.format(id=group.kbp_id))
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            stats.errors.append(f"group {group.kbp_id}: {exc}")
            continue
        stats.groups_fetched += 1
        with transaction.atomic():
            stats.links_upserted += sync_links_for_group(group, html, dry_run=False)
        if delay_sec > 0:
            time.sleep(delay_sec)

    return stats
