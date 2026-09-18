/** Weekly timetable snapshots for Settings → Архив. */

import { storageGetObject, storageSetObject } from "@/lib/client/storage";
import type { SearchResult } from "@/lib/client/searchApi";
import { hasNextWeekMondayColumn } from "@/lib/client/timetableDisplay";

export const WEEK_ARCHIVE_KEY = "timetable_week_archive_v1";
export const WEEK_ARCHIVE_LAST_KEY = "timetable_week_archive_last_v1";

export type WeekArchiveEntry = {
  id: string;
  weekKey: string;
  label: string;
  /** 0 = текущая неделя, 1 = следующий понедельник (right_week). */
  weekPage: 0 | 1;
  result: SearchResult;
  data: unknown;
  savedAt: number;
};

export function isoWeekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function weekArchiveLabel(weekKey: string, weekPage: 0 | 1 = 0): string {
  const m = /^(\d{4})-W(\d{2})$/.exec(weekKey);
  const base = m ? `Неделя ${Number(m[2])}, ${m[1]}` : weekKey;
  return weekPage === 1 ? `${base} · след. Пн` : base;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `wa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function entryWeekPage(e: WeekArchiveEntry): 0 | 1 {
  return e.weekPage === 1 ? 1 : 0;
}

function sameEntity(a: SearchResult, b: SearchResult): boolean {
  return a?.type === b?.type && String(a?.id) === String(b?.id);
}

export async function loadWeekArchive(): Promise<WeekArchiveEntry[]> {
  const list = await storageGetObject<WeekArchiveEntry[]>(WEEK_ARCHIVE_KEY);
  if (!Array.isArray(list)) return [];
  return list
    .filter((e) => e?.id && e?.weekKey && e?.data && e?.result)
    .map((e) => ({
      ...e,
      weekPage: entryWeekPage(e),
      label: e.label || weekArchiveLabel(e.weekKey, entryWeekPage(e)),
    }))
    .sort((a, b) => b.savedAt - a.savedAt);
}

export async function getWeekArchiveById(id: string): Promise<WeekArchiveEntry | null> {
  const list = await loadWeekArchive();
  return list.find((e) => e.id === id) ?? null;
}

export async function removeWeekArchive(id: string): Promise<void> {
  const list = await loadWeekArchive();
  await storageSetObject(
    WEEK_ARCHIVE_KEY,
    list.filter((e) => e.id !== id)
  );
}

export async function clearWeekArchive(): Promise<void> {
  await storageSetObject(WEEK_ARCHIVE_KEY, []);
  await storageSetObject(WEEK_ARCHIVE_LAST_KEY, null);
}

/**
 * Before overwriting live cache: if the ISO week rolled over, snapshot
 * `previousData` (last week's timetable) under a new uuid.
 */
export async function maybeArchiveWeekSnapshot(input: {
  result: SearchResult;
  previousData: unknown | null | undefined;
  now?: Date;
}): Promise<WeekArchiveEntry | null> {
  const weekKey = isoWeekKey(input.now ?? new Date());
  const entityKey = `${input.result.type}|${input.result.id}`;
  const lastMap =
    (await storageGetObject<Record<string, string>>(WEEK_ARCHIVE_LAST_KEY)) || {};
  const prevWeek = lastMap[entityKey];

  let created: WeekArchiveEntry | null = null;

  if (prevWeek && prevWeek !== weekKey && input.previousData) {
    const list = await loadWeekArchive();
    const dup = list.find(
      (e) =>
        e.weekKey === prevWeek &&
        entryWeekPage(e) === 0 &&
        sameEntity(e.result, input.result)
    );
    if (!dup) {
      created = {
        id: newId(),
        weekKey: prevWeek,
        label: weekArchiveLabel(prevWeek, 0),
        weekPage: 0,
        result: input.result,
        data: input.previousData,
        savedAt: Date.now(),
      };
      list.unshift(created);
      await storageSetObject(WEEK_ARCHIVE_KEY, list.slice(0, 80));
    }
  }

  if (prevWeek !== weekKey) {
    lastMap[entityKey] = weekKey;
    await storageSetObject(WEEK_ARCHIVE_LAST_KEY, lastMap);
  }

  return created;
}

async function upsertWeekArchiveRow(input: {
  result: SearchResult;
  data: unknown;
  weekKey: string;
  weekPage: 0 | 1;
}): Promise<WeekArchiveEntry> {
  const list = await loadWeekArchive();
  const idx = list.findIndex(
    (e) =>
      e.weekKey === input.weekKey &&
      entryWeekPage(e) === input.weekPage &&
      sameEntity(e.result, input.result)
  );

  const entry: WeekArchiveEntry = {
    id: idx >= 0 ? list[idx].id : newId(),
    weekKey: input.weekKey,
    label: weekArchiveLabel(input.weekKey, input.weekPage),
    weekPage: input.weekPage,
    result: input.result,
    data: input.data,
    savedAt: Date.now(),
  };

  if (idx >= 0) list[idx] = entry;
  else list.unshift(entry);

  await storageSetObject(WEEK_ARCHIVE_KEY, list.slice(0, 80));
  return entry;
}

/**
 * Upsert current week (and next-Monday week when present) so Архив mirrors live.
 */
export async function ensureCurrentWeekArchive(input: {
  result: SearchResult;
  data: unknown;
  now?: Date;
}): Promise<WeekArchiveEntry[]> {
  const now = input.now ?? new Date();
  const currentKey = isoWeekKey(now);
  const entries: WeekArchiveEntry[] = [
    await upsertWeekArchiveRow({
      result: input.result,
      data: input.data,
      weekKey: currentKey,
      weekPage: 0,
    }),
  ];

  if (hasNextWeekMondayColumn(input.data as any)) {
    const next = new Date(now);
    next.setDate(next.getDate() + 7);
    const nextKey = isoWeekKey(next);
    entries.push(
      await upsertWeekArchiveRow({
        result: input.result,
        data: input.data,
        weekKey: nextKey,
        weekPage: 1,
      })
    );
  }

  const entityKey = `${input.result.type}|${input.result.id}`;
  const lastMap =
    (await storageGetObject<Record<string, string>>(WEEK_ARCHIVE_LAST_KEY)) || {};
  lastMap[entityKey] = currentKey;
  await storageSetObject(WEEK_ARCHIVE_LAST_KEY, lastMap);

  return entries;
}
