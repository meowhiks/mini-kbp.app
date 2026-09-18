import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();

vi.mock("@/lib/client/storage", () => ({
  storageGet: async (key: string) => store.get(key) ?? null,
  storageRemove: async (key: string) => {
    store.delete(key);
  },
  storageSetObject: async (key: string, value: unknown) => {
    store.set(key, JSON.stringify(value));
  },
}));

vi.mock("@/lib/client/offlineArchive", () => ({
  ARCHIVE_TIMETABLES_KEY: "offline_timetables_archive_v1",
  clearTimetableArchive: async () => {
    store.set("offline_timetables_archive_v1", "[]");
  },
}));

vi.mock("@/lib/client/weekArchive", () => ({
  WEEK_ARCHIVE_KEY: "timetable_week_archive_v1",
  WEEK_ARCHIVE_LAST_KEY: "timetable_week_archive_last_v1",
  clearWeekArchive: async () => {
    store.set("timetable_week_archive_v1", "[]");
    store.delete("timetable_week_archive_last_v1");
  },
}));

vi.mock("@/lib/client/offlineCache", () => ({
  OFFLINE_CACHE_KEYS: {
    USER_PROFILE: "cached_user_profile_v1",
    APP_SESSIONS: "cached_app_sessions_v1",
    STAFF_JOURNAL_ACCESS: "cached_staff_journal_access_v1",
    STAFF_BUNDLES: "cached_staff_bundles_v1",
  },
}));

import {
  CLEAR_CATEGORY_KEYS,
  clearAppDataCategories,
  formatStorageBytes,
  measureClearCategorySizes,
  type ClearAppDataOptions,
} from "@/lib/client/appClearData";

describe("formatStorageBytes", () => {
  it("formats empty and small sizes", () => {
    expect(formatStorageBytes(0)).toBe("пусто");
    expect(formatStorageBytes(500)).toBe("500 B");
  });

  it("formats KB and MB", () => {
    expect(formatStorageBytes(1536)).toBe("1.5 KB");
    expect(formatStorageBytes(2 * 1024 * 1024)).toBe("2.0 MB");
  });
});

describe("measureClearCategorySizes", () => {
  beforeEach(() => {
    store.clear();
  });

  it("sums UTF-8 bytes for each category", async () => {
    const payload = "x".repeat(100);
    store.set("cached_journal_data", payload);
    store.set("cached_timetable_data", "tt");
    store.set("offline_timetables_archive_v1", JSON.stringify([{ id: "1" }]));

    const sizes = await measureClearCategorySizes();
    expect(sizes.cache).toBe(100);
    expect(sizes.timetables).toBe(2 + JSON.stringify([{ id: "1" }]).length);
  });

  it("returns zeros when nothing stored", async () => {
    const sizes = await measureClearCategorySizes();
    expect(sizes).toEqual({
      cache: 0,
      timetables: 0,
    });
  });
});

describe("clearAppDataCategories", () => {
  beforeEach(() => {
    store.clear();
    for (const key of CLEAR_CATEGORY_KEYS.cache) store.set(key, "c");
    for (const key of CLEAR_CATEGORY_KEYS.timetables) store.set(key, "t");
    store.set("offline_timetables_archive_v1", '[{"id":"x"}]');
  });

  it("clears only selected categories", async () => {
    const opts: ClearAppDataOptions = {
      clearCache: true,
      clearTimetables: false,
    };
    await clearAppDataCategories(opts);
    expect(store.has("cached_journal_data")).toBe(false);
    expect(store.has("cached_timetable_data")).toBe(true);
  });

  it("clears timetable cache including offline archive", async () => {
    await clearAppDataCategories({
      clearCache: false,
      clearTimetables: true,
    });
    expect(store.has("cached_timetable_data")).toBe(false);
    expect(store.get("offline_timetables_archive_v1")).toBe("[]");
    expect(store.has("cached_journal_data")).toBe(true);
  });
});
