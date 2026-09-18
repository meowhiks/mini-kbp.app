/** Overlay замен поверх пар расписания kbp.by */

import { getTimetableDisplayDay } from "@/lib/client/timetableDisplay";
import { toIsoLocal } from "@/lib/client/timetableJournalMarks";
import { parseTimetableWeekDates } from "@/lib/client/timetableWeekDates";
import { getAuthAccessToken } from "@/lib/client/appAuth";
import { getServerUrl } from "@/lib/client/serverUrl";
import { platformFetch } from "@/lib/client/platformFetch";
import { storageGet, storageSet } from "@/lib/client/storage";

export type OverlayEventType = "NEW_LESSON" | "CANCELLATION" | "REPLACEMENT";

export type OverlayEntry = {
  id?: number;
  batch_id?: number;
  date: string;
  group_code: string;
  kbp_group_id?: string | null;
  lesson_number: number;
  event_type: OverlayEventType;
  replacement_data: {
    subject?: string | null;
    room?: string | null;
    teachers?: string[];
  };
  original_data: {
    subject?: string | null;
    room?: string | null;
    teachers?: string[];
  };
};

export type OverlayResponse = {
  from: string;
  to: string;
  days: Record<string, OverlayEntry[]>;
};

export type OverlayEntity = {
  type: "group" | "teacher" | "place" | "subject";
  id: string;
  name: string;
};

const OVERLAY_CACHE_KEY = "cached_replacements_overlay_v1";

function norm(s: string | null | undefined): string {
  return (s || "").trim().toLowerCase().replace(/ё/g, "е");
}

function compact(s: string): string {
  return norm(s).replace(/[\s\-–—]+/g, "");
}

/** П-491 / 491П / 491-п → `491п` для сравнения с каталогом kbp. */
export function groupIdentity(name: string | null | undefined): string {
  const c = compact(name || "");
  if (!c) return "";
  const m = c.match(/^([а-яa-z]*)(\d+)([а-яa-z]*)$/i);
  if (!m) return c;
  const prefix = (m[1] || "").toLowerCase();
  const digits = m[2];
  const suffix = (m[3] || "").toLowerCase();
  if (prefix && suffix) return c;
  const letter = prefix || suffix;
  return letter ? `${digits}${letter}` : digits;
}

/** `ауд. 410` / `Ауд.410` → `410` для сравнения с каталогом kbp. */
export function normalizeRoomLabel(room: string | null | undefined): string {
  return norm(room).replace(/^(?:ауд\.?|аудитория|каб\.?|кабинет)\s*/i, "").trim();
}

export function entryMatchesEntity(entry: OverlayEntry, entity: OverlayEntity | null | undefined): boolean {
  if (!entity) return true;
  const repl = entry.replacement_data || {};
  const orig = entry.original_data || {};
  const id = String(entity.id || "");
  const name = norm(entity.name);

  if (entity.type === "group") {
    if (entry.kbp_group_id && String(entry.kbp_group_id) === id) return true;
    if (
      name &&
      (norm(entry.group_code) === name ||
        compact(entry.group_code) === compact(entity.name) ||
        groupIdentity(entry.group_code) === groupIdentity(entity.name))
    ) {
      return true;
    }
    return false;
  }

  if (entity.type === "teacher") {
    const names = [...(repl.teachers || []), ...(orig.teachers || [])].map(norm);
    if (name && names.some((t) => t.includes(name) || name.includes(t))) return true;
    return false;
  }

  if (entity.type === "place") {
    const placeKey = normalizeRoomLabel(entity.name);
    const rooms = [repl.room, orig.room].map((r) => normalizeRoomLabel(r == null ? "" : String(r)));
    if (placeKey && rooms.some((r) => r === placeKey || r.includes(placeKey) || placeKey.includes(r))) {
      return true;
    }
    return false;
  }

  if (entity.type === "subject") {
    const subjects = [repl.subject, orig.subject].map((s) => norm(s == null ? "" : String(s)));
    if (name && subjects.some((s) => s.includes(name) || name.includes(s))) return true;
    return false;
  }

  return false;
}

function dayIndexToIso(
  timetable: any,
  displayDay: number
): string | null {
  const current = parseTimetableWeekDates(timetable?.currentWeek?.dateRange || "");
  if (displayDay >= 0 && displayDay <= 5 && current[displayDay]) {
    return toIsoLocal(current[displayDay]);
  }
  if (displayDay === 6) {
    const next = parseTimetableWeekDates(timetable?.nextWeekMonday?.dateRange || "");
    if (next[0]) return toIsoLocal(next[0]);
    if (current[0]) {
      const d = new Date(current[0]);
      d.setDate(d.getDate() + 7);
      return toIsoLocal(d);
    }
  }
  return null;
}

function buildIsoToDayMap(timetable: any): Map<string, number> {
  const map = new Map<string, number>();
  for (let d = 0; d <= 6; d++) {
    const iso = dayIndexToIso(timetable, d);
    if (iso) map.set(iso, d);
  }
  return map;
}

function applyEntryToPair(pair: any, entry: OverlayEntry): any {
  const repl = entry.replacement_data || {};
  const teachers = Array.isArray(repl.teachers) ? repl.teachers.filter(Boolean) : [];
  const teacherStr = teachers.join(", ");

  if (entry.event_type === "CANCELLATION") {
    return {
      ...pair,
      status: "removed",
      subject: "Урок снят",
      teacher: "",
      room: "",
      overlayEvent: entry.event_type,
    };
  }

  if (entry.event_type === "NEW_LESSON") {
    return {
      ...pair,
      status: "added",
      subject: repl.subject || pair.subject || "",
      teacher: teacherStr || pair.teacher || "",
      room: repl.room || pair.room || "",
      overlayEvent: entry.event_type,
    };
  }

  // REPLACEMENT
  return {
    ...pair,
    status: "replaced",
    subject: repl.subject || pair.subject || "",
    teacher: teacherStr || pair.teacher || "",
    room: repl.room != null && repl.room !== "" ? repl.room : pair.room,
    overlayEvent: entry.event_type,
  };
}

function makePairFromEntry(entry: OverlayEntry, displayDay: number, timetable: any): any {
  const repl = entry.replacement_data || {};
  const teachers = Array.isArray(repl.teachers) ? repl.teachers.filter(Boolean) : [];
  const day = displayDay === 6 ? 0 : displayDay;
  const weekOffset = displayDay === 6 ? 1 : 0;
  const weekDays = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
  return {
    pairNumber: entry.lesson_number,
    day,
    weekOffset,
    dayName: weekDays[day] || "",
    subject: entry.event_type === "CANCELLATION" ? "Урок снят" : repl.subject || "",
    teacher: entry.event_type === "CANCELLATION" ? "" : teachers.join(", "),
    room: entry.event_type === "CANCELLATION" ? "" : repl.room || "",
    group: entry.group_code || timetable?.groupName || "",
    refs: { teachers: [] },
    status: entry.event_type === "NEW_LESSON" ? "added" : entry.event_type === "CANCELLATION" ? "removed" : "replaced",
    overlayEvent: entry.event_type,
  };
}

/** Иммутабельный merge overlay в timetable.pairs */
export function applyReplacementsOverlay(
  timetable: any,
  overlay: OverlayResponse | null | undefined,
  entity?: OverlayEntity | null
): any {
  if (!timetable || !Array.isArray(timetable.pairs) || !overlay?.days) {
    return timetable;
  }

  const isoToDay = buildIsoToDayMap(timetable);
  const pairs = timetable.pairs.map((p: any) => ({ ...p }));
  const used = new Set<string>();

  for (const [iso, entries] of Object.entries(overlay.days)) {
    const displayDay = isoToDay.get(iso);
    if (displayDay === undefined) continue;
    for (const entry of entries) {
      if (!entryMatchesEntity(entry, entity)) continue;
      const key = `${displayDay}:${entry.lesson_number}:${entry.id ?? entry.group_code}`;
      if (used.has(key)) continue;

      const idx = pairs.findIndex((p: any) => {
        const pd = getTimetableDisplayDay(p);
        return pd === displayDay && Number(p.pairNumber) === Number(entry.lesson_number);
      });

      if (idx >= 0) {
        pairs[idx] = applyEntryToPair(pairs[idx], entry);
        used.add(key);
      } else if (entry.event_type === "NEW_LESSON" || entry.event_type === "REPLACEMENT") {
        pairs.push(makePairFromEntry(entry, displayDay, timetable));
        used.add(key);
      } else if (entry.event_type === "CANCELLATION") {
        pairs.push(makePairFromEntry(entry, displayDay, timetable));
        used.add(key);
      }
    }
  }

  // Mark days that have overlay changes
  const dayReplacementStatus = Array.isArray(timetable.dayReplacementStatus)
    ? timetable.dayReplacementStatus.map((s: any) => ({ ...s }))
    : [];
  for (const [iso, entries] of Object.entries(overlay.days)) {
    const displayDay = isoToDay.get(iso);
    if (displayDay === undefined) continue;
    const relevant = entries.filter((e) => entryMatchesEntity(e, entity));
    if (!relevant.length) continue;
    while (dayReplacementStatus.length <= displayDay) {
      dayReplacementStatus.push({ label: "", hasChanges: false, noChanges: false, unknown: true });
    }
    dayReplacementStatus[displayDay] = {
      ...dayReplacementStatus[displayDay],
      hasChanges: true,
      noChanges: false,
      unknown: false,
      label: dayReplacementStatus[displayDay]?.label || "замены (MiniKBP)",
    };
  }

  return {
    ...timetable,
    pairs,
    dayReplacementStatus,
    overlayApplied: true,
  };
}

export async function cacheOverlay(data: OverlayResponse): Promise<void> {
  await storageSet(OVERLAY_CACHE_KEY, JSON.stringify(data));
}

export async function loadCachedOverlay(): Promise<OverlayResponse | null> {
  const raw = await storageGet(OVERLAY_CACHE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OverlayResponse;
  } catch {
    return null;
  }
}

export async function fetchReplacementsOverlay(opts?: {
  from?: string;
  to?: string;
}): Promise<OverlayResponse | null> {
  const base = getServerUrl().replace(/\/$/, "");
  if (!base) return loadCachedOverlay();
  const access = await getAuthAccessToken();
  if (!access) return loadCachedOverlay();

  const from =
    opts?.from ||
    (() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return toIsoLocal(d);
    })();
  const to =
    opts?.to ||
    (() => {
      const d = new Date();
      d.setDate(d.getDate() + 14);
      return toIsoLocal(d);
    })();

  try {
    const res = await platformFetch(
      `${base}/v0/replacements/overlay/?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      {
        headers: { Authorization: `Bearer ${access}` },
      }
    );
    if (!res.ok) return loadCachedOverlay();
    const data = (await res.json()) as OverlayResponse;
    await cacheOverlay(data);
    return data;
  } catch {
    return loadCachedOverlay();
  }
}

export async function mergeTimetableWithOverlay(
  timetable: any,
  entity?: OverlayEntity | null
): Promise<any> {
  if (!timetable) return timetable;
  const overlay = (await fetchReplacementsOverlay()) || (await loadCachedOverlay());
  return applyReplacementsOverlay(timetable, overlay, entity || null);
}
