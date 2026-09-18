import { storageGet, storageSet } from "@/lib/client/storage";

export type JournalSkeletonMeta = {
  subjectCount: number;
  dayCount: number;
};

const KEY = "journal_skeleton_meta_v1";

const DEFAULT_META: JournalSkeletonMeta = { subjectCount: 8, dayCount: 18 };

export function journalSkeletonMetaFromData(data: unknown): JournalSkeletonMeta | null {
  if (!data || typeof data !== "object") return null;
  const subjects = (data as { subjects?: unknown[] }).subjects;
  if (!Array.isArray(subjects) || subjects.length === 0) return null;

  const first = subjects[0] as { marks?: unknown[]; gradesMatrix?: Record<string, unknown> };
  const fromMarks = Array.isArray(first?.marks) ? first.marks.length : 0;
  const fromMatrix = first?.gradesMatrix ? Object.keys(first.gradesMatrix).length : 0;
  const fromDates = Array.isArray((data as { dates?: unknown[] }).dates)
    ? (data as { dates: unknown[] }).dates.length
    : 0;
  const dayCount = Math.max(fromMarks, fromMatrix, fromDates, 1);

  return { subjectCount: subjects.length, dayCount };
}

export function normalizeJournalSkeletonMeta(raw: unknown): JournalSkeletonMeta {
  if (!raw || typeof raw !== "object") return DEFAULT_META;
  const subjectCount = Number((raw as JournalSkeletonMeta).subjectCount);
  const dayCount = Number((raw as JournalSkeletonMeta).dayCount);
  return {
    subjectCount: Number.isFinite(subjectCount) && subjectCount > 0 ? Math.min(subjectCount, 40) : DEFAULT_META.subjectCount,
    dayCount: Number.isFinite(dayCount) && dayCount > 0 ? Math.min(dayCount, 60) : DEFAULT_META.dayCount,
  };
}

export async function loadJournalSkeletonMeta(): Promise<JournalSkeletonMeta> {
  try {
    const raw = await storageGet(KEY);
    if (!raw) return DEFAULT_META;
    return normalizeJournalSkeletonMeta(JSON.parse(raw));
  } catch {
    return DEFAULT_META;
  }
}

export async function persistJournalSkeletonMeta(data: unknown): Promise<void> {
  const meta = journalSkeletonMetaFromData(data);
  if (!meta) return;
  try {
    await storageSet(KEY, JSON.stringify(meta));
  } catch {
    // ignore quota errors
  }
}
