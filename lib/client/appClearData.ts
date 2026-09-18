import { storageGet, storageRemove } from "@/lib/client/storage";
import { OFFLINE_CACHE_KEYS } from "@/lib/client/offlineCache";
import {
  ARCHIVE_TIMETABLES_KEY,
  clearTimetableArchive,
} from "@/lib/client/offlineArchive";
import {
  WEEK_ARCHIVE_KEY,
  WEEK_ARCHIVE_LAST_KEY,
  clearWeekArchive,
} from "@/lib/client/weekArchive";

export type ClearAppDataOptions = {
  clearCache: boolean;
  clearTimetables: boolean;
};

export type ClearCategoryId = "cache" | "timetables";

export type ClearCategorySizes = Record<ClearCategoryId, number>;

/** Keys whose raw storage bytes count toward a clear category. */
export const CLEAR_CATEGORY_KEYS: Record<ClearCategoryId, readonly string[]> = {
  cache: [
    "cached_journal_data",
    "cached_lateness_data",
    "cached_journal_entries_v1",
    "journal_skeleton_meta_v1",
    "cached_student_fio",
    OFFLINE_CACHE_KEYS.USER_PROFILE,
    OFFLINE_CACHE_KEYS.APP_SESSIONS,
    OFFLINE_CACHE_KEYS.STAFF_JOURNAL_ACCESS,
    OFFLINE_CACHE_KEYS.STAFF_BUNDLES,
    // legacy leftovers
    "journal_login_history_v1",
    "journal_login_form_v1",
    WEEK_ARCHIVE_KEY,
    WEEK_ARCHIVE_LAST_KEY,
  ],
  timetables: [
    "cached_timetable_data",
    "cached_selected_timetable_result",
    ARCHIVE_TIMETABLES_KEY,
  ],
};

function utf8Bytes(value: string): number {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value).length;
  }
  return value.length;
}

export function formatStorageBytes(bytes: number): string {
  if (!bytes || bytes < 0) return "пусто";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function measureKeys(keys: readonly string[]): Promise<number> {
  let total = 0;
  for (const key of keys) {
    const value = await storageGet(key);
    if (!value) continue;
    const trimmed = value.trim();
    if (trimmed === "[]" || trimmed === "{}" || trimmed === "null") continue;
    total += utf8Bytes(value);
  }
  return total;
}

export async function measureClearCategorySizes(): Promise<ClearCategorySizes> {
  const [cache, timetables] = await Promise.all([
    measureKeys(CLEAR_CATEGORY_KEYS.cache),
    measureKeys(CLEAR_CATEGORY_KEYS.timetables),
  ]);
  return { cache, timetables };
}

export async function clearAppDataCategories(opts: ClearAppDataOptions): Promise<void> {
  await Promise.all([
    opts.clearCache
      ? Promise.all([
          ...CLEAR_CATEGORY_KEYS.cache.map((key) => storageRemove(key)),
          clearWeekArchive(),
        ])
      : Promise.resolve(),
    opts.clearTimetables
      ? Promise.all([
          storageRemove("cached_timetable_data"),
          storageRemove("cached_selected_timetable_result"),
          clearTimetableArchive(),
        ])
      : Promise.resolve(),
  ]);
}

export function anyClearOptionSelected(opts: ClearAppDataOptions): boolean {
  return opts.clearCache || opts.clearTimetables;
}
