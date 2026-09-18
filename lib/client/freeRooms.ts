import { getKbpPairTime } from "@/lib/client/kbpBellSchedule";
import { getLiveCalendarDayIndex, pairMatchesDisplayDay } from "@/lib/client/timetableDisplay";
import {
  fetchTimetableByCategory,
  listTimetableEntities,
  type SearchResult,
} from "@/lib/client/searchApi";
import { loadTimetableArchive, timetableArchiveId } from "@/lib/client/offlineArchive";

export type FreeRoomsWhen = "now" | "tomorrow" | "date";

export type FreeRoomsFilter = {
  when: FreeRoomsWhen;
  dateIso?: string;
  /** 0–13; null/"auto" → текущий урок (для now) */
  lessonNumber?: number | null;
};

export type FreeRoomHit = {
  id: string;
  name: string;
};

export const FREE_ROOMS_LESSON_MIN = 0;
export const FREE_ROOMS_LESSON_MAX = 13;

function timeToMinutes(t: string): number | null {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec((t || "").trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function parseIsoLocal(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function isActiveLesson(subject: string | undefined, status: string | undefined): boolean {
  const s = (subject || "").trim();
  if (!s || s === "Урок снят") return false;
  if (status === "removed" || status === "cancelled" || status === "empty") return false;
  return true;
}

/** Day index 0=Mon…5=Sat; null = Sunday (no classes). */
export function resolveFreeRoomsDayIndex(filter: FreeRoomsFilter, now = new Date()): number | null {
  if (filter.when === "now") {
    return getLiveCalendarDayIndex(now) >= 0 ? getLiveCalendarDayIndex(now) : null;
  }
  if (filter.when === "tomorrow") {
    const t = new Date(now);
    t.setDate(t.getDate() + 1);
    let live = getLiveCalendarDayIndex(t);
    if (live < 0) {
      t.setDate(t.getDate() + 1);
      live = getLiveCalendarDayIndex(t);
    }
    return live >= 0 ? live : null;
  }
  if (!filter.dateIso) return null;
  const d = parseIsoLocal(filter.dateIso);
  if (!d) return null;
  const live = getLiveCalendarDayIndex(d);
  return live >= 0 ? live : null;
}

export function resolveCurrentLessonNumber(dayIndex: number, now = new Date()): number | null {
  if (dayIndex < 0 || dayIndex > 5) return null;
  const mins = now.getHours() * 60 + now.getMinutes();
  for (let n = FREE_ROOMS_LESSON_MIN; n <= FREE_ROOMS_LESSON_MAX; n++) {
    if (n === 0) continue; // нет звонка для «0»
    const { start, end } = getKbpPairTime(n, dayIndex);
    const s = timeToMinutes(start);
    const e = timeToMinutes(end);
    if (s == null || e == null) continue;
    if (mins >= s && mins < e) return n;
  }
  let best: number | null = null;
  let bestStart = Infinity;
  for (let n = 1; n <= FREE_ROOMS_LESSON_MAX; n++) {
    const { start } = getKbpPairTime(n, dayIndex);
    const s = timeToMinutes(start);
    if (s == null || s < mins) continue;
    if (s < bestStart) {
      bestStart = s;
      best = n;
    }
  }
  return best;
}

function placeBusyAt(timetable: any, dayIndex: number, lessonNumber: number | null): boolean {
  const pairs = Array.isArray(timetable?.pairs) ? timetable.pairs : [];
  for (const p of pairs) {
    if (!pairMatchesDisplayDay(p, dayIndex)) continue;
    if (!isActiveLesson(p.subject, p.status)) continue;
    if (lessonNumber == null) return true;
    if (Number(p.pairNumber) === lessonNumber) return true;
  }
  return false;
}

const sessionPlaceCache = new Map<string, any>();

async function loadPlaceTimetable(place: SearchResult): Promise<any | null> {
  const id = timetableArchiveId("place", place.id);
  if (sessionPlaceCache.has(id)) return sessionPlaceCache.get(id);

  const archive = await loadTimetableArchive();
  const cached = archive.find((e) => e.id === id);
  if (cached?.data) {
    sessionPlaceCache.set(id, cached.data);
    return cached.data;
  }

  const res = await fetchTimetableByCategory("place", place.id, { persistCache: false });
  if (!res.success || !res.data) return null;
  sessionPlaceCache.set(id, res.data);
  return res.data;
}

/**
 * Аудитории без урока в выбранный слот.
 * В воскресенье для «сейчас» — все аудитории свободны (пар нет).
 */
export async function findFreeRooms(
  filter: FreeRoomsFilter,
  options?: {
    signal?: AbortSignal;
    onProgress?: (done: number, total: number, hits: FreeRoomHit[]) => void;
    concurrency?: number;
  }
): Promise<FreeRoomHit[]> {
  const all = await listTimetableEntities();
  const places = all.filter((e) => e.type === "place");
  if (places.length === 0) return [];

  const dayIndex = resolveFreeRoomsDayIndex(filter);
  const sundayNow = filter.when === "now" && dayIndex == null;

  let lessonNumber = filter.lessonNumber ?? null;
  if (!sundayNow && filter.when === "now" && (lessonNumber == null || Number.isNaN(lessonNumber))) {
    lessonNumber = dayIndex != null ? resolveCurrentLessonNumber(dayIndex) : null;
  }

  // Воскресенье / нет текущего урока после конца дня: все свободны (для now без явного урока)
  if (sundayNow) {
    const hits = places.map((p) => ({ id: p.id, name: p.name }));
    options?.onProgress?.(places.length, places.length, hits);
    return hits.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }

  if (dayIndex == null) return [];

  const hits: FreeRoomHit[] = [];
  const concurrency = Math.max(1, Math.min(options?.concurrency ?? 6, 10));
  let done = 0;

  for (let i = 0; i < places.length; i += concurrency) {
    if (options?.signal?.aborted) break;
    const batch = places.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (place) => {
        try {
          const data = await loadPlaceTimetable(place);
          if (!data) return null;
          if (placeBusyAt(data, dayIndex, lessonNumber)) return null;
          return { id: place.id, name: place.name } satisfies FreeRoomHit;
        } catch {
          return null;
        }
      })
    );
    for (const hit of results) {
      if (hit) hits.push(hit);
    }
    done += batch.length;
    options?.onProgress?.(done, places.length, [...hits].sort((a, b) => a.name.localeCompare(b.name, "ru")));
  }

  return hits.sort((a, b) => a.name.localeCompare(b.name, "ru"));
}
