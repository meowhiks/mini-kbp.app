import type { SearchResult } from "@/lib/client/searchApi";
import { storageGetObject, storageSetObject } from "@/lib/client/storage";

export const ARCHIVE_JOURNALS_KEY = "offline_journals_archive_v1";
export const ARCHIVE_TIMETABLES_KEY = "offline_timetables_archive_v1";

export type JournalArchiveEntry = {
  id: string;
  surname: string;
  groupId: string;
  groupName: string;
  journalData: any;
  latenessData?: any | null;
  savedAt: number;
  fio?: string;
};

export type TimetableArchiveEntry = {
  id: string;
  result: SearchResult;
  data: any;
  savedAt: number;
};

export function journalArchiveId(groupId: string, surname: string): string {
  return `${groupId}|${surname.trim().toLowerCase()}`;
}

export function timetableArchiveId(type: string, entityId: string): string {
  return `${type}|${entityId}`;
}

export async function loadJournalArchive(): Promise<JournalArchiveEntry[]> {
  const list = await storageGetObject<JournalArchiveEntry[]>(ARCHIVE_JOURNALS_KEY);
  if (!Array.isArray(list)) return [];
  return list.filter((e) => e?.id && e?.journalData);
}

export async function upsertJournalArchive(
  entry: Omit<JournalArchiveEntry, "savedAt"> & { savedAt?: number }
): Promise<void> {
  const list = await loadJournalArchive();
  const savedAt = entry.savedAt ?? Date.now();
  const next: JournalArchiveEntry = { ...entry, savedAt };
  const idx = list.findIndex((e) => e.id === entry.id);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...next };
  } else {
    list.unshift(next);
  }
  list.sort((a, b) => b.savedAt - a.savedAt);
  await storageSetObject(ARCHIVE_JOURNALS_KEY, list);
}

export async function removeJournalArchive(id: string): Promise<void> {
  const list = await loadJournalArchive();
  await storageSetObject(
    ARCHIVE_JOURNALS_KEY,
    list.filter((e) => e.id !== id)
  );
}

export async function loadTimetableArchive(): Promise<TimetableArchiveEntry[]> {
  const list = await storageGetObject<TimetableArchiveEntry[]>(ARCHIVE_TIMETABLES_KEY);
  if (!Array.isArray(list)) return [];
  return list.filter((e) => e?.id && e?.result);
}

export async function upsertTimetableArchive(
  entry: Omit<TimetableArchiveEntry, "savedAt"> & { savedAt?: number }
): Promise<void> {
  const MAX_CACHED = 10;
  const list = await loadTimetableArchive();
  const savedAt = entry.savedAt ?? Date.now();
  const next: TimetableArchiveEntry = { ...entry, savedAt };
  const idx = list.findIndex((e) => e.id === entry.id);
  let updated: TimetableArchiveEntry[];
  if (idx >= 0) {
    updated = list.map((e, i) => (i === idx ? { ...e, ...next } : e));
  } else {
    updated = [next, ...list];
  }
  updated = [...updated].sort((a, b) => b.savedAt - a.savedAt).slice(0, MAX_CACHED);
  await storageSetObject(ARCHIVE_TIMETABLES_KEY, updated);
}

export async function removeTimetableArchive(id: string): Promise<void> {
  const list = await loadTimetableArchive();
  await storageSetObject(
    ARCHIVE_TIMETABLES_KEY,
    list.filter((e) => e.id !== id)
  );
}

export async function clearJournalArchive(): Promise<void> {
  await storageSetObject(ARCHIVE_JOURNALS_KEY, []);
}

export async function clearTimetableArchive(): Promise<void> {
  await storageSetObject(ARCHIVE_TIMETABLES_KEY, []);
}
