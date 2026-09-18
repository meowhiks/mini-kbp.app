import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  accentHex,
  accentHoverHex,
  DEFAULT_ACCENT,
  isAccentId,
} from "@/lib/client/accentColor";
import {
  ensureCurrentWeekArchive,
  isoWeekKey,
  maybeArchiveWeekSnapshot,
  weekArchiveLabel,
  WEEK_ARCHIVE_KEY,
  WEEK_ARCHIVE_LAST_KEY,
} from "@/lib/client/weekArchive";

const mem = new Map<string, string>();

vi.mock("@/lib/client/storage", () => ({
  storageGetObject: async (key: string) => {
    const raw = mem.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
  storageSetObject: async (key: string, value: unknown) => {
    mem.set(key, JSON.stringify(value));
  },
}));

describe("accentColor", () => {
  it("resolves presets and default", () => {
    expect(DEFAULT_ACCENT).toBe("blue");
    expect(accentHex("green")).toBe("#31b545");
    expect(accentHex("nope")).toBe("#3390ec");
    expect(isAccentId("pink")).toBe(true);
    expect(isAccentId("neon")).toBe(false);
    expect(accentHoverHex("#3390ec")).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("weekArchive", () => {
  beforeEach(() => {
    mem.clear();
  });

  it("formats ISO week labels", () => {
    expect(isoWeekKey(new Date("2026-09-08T12:00:00Z"))).toMatch(/^\d{4}-W\d{2}$/);
    expect(weekArchiveLabel("2026-W37")).toBe("Неделя 37, 2026");
    expect(weekArchiveLabel("2026-W38", 1)).toContain("след. Пн");
  });

  it("archives previous week data when ISO week rolls", async () => {
    const result = { id: "1", name: "101", type: "group", typeLabel: "Группа" } as const;
    mem.set(WEEK_ARCHIVE_LAST_KEY, JSON.stringify({ "group|1": "2026-W36" }));
    const created = await maybeArchiveWeekSnapshot({
      result: result as any,
      previousData: { days: [{ name: "Пн" }] },
      now: new Date("2026-09-08T12:00:00Z"),
    });
    expect(created?.weekKey).toBe("2026-W36");
    expect(created?.weekPage).toBe(0);
    expect(created?.id).toBeTruthy();
    const list = JSON.parse(mem.get(WEEK_ARCHIVE_KEY) || "[]");
    expect(list).toHaveLength(1);
    const last = JSON.parse(mem.get(WEEK_ARCHIVE_LAST_KEY) || "{}");
    expect(last["group|1"]).toBe(isoWeekKey(new Date("2026-09-08T12:00:00Z")));
  });

  it("does not archive when week unchanged", async () => {
    const week = isoWeekKey(new Date("2026-09-08T12:00:00Z"));
    const result = { id: "1", name: "101", type: "group", typeLabel: "Группа" } as const;
    mem.set(WEEK_ARCHIVE_LAST_KEY, JSON.stringify({ "group|1": week }));
    const created = await maybeArchiveWeekSnapshot({
      result: result as any,
      previousData: { days: [] },
      now: new Date("2026-09-08T12:00:00Z"),
    });
    expect(created).toBeNull();
  });

  it("upserts current week and next Monday when present", async () => {
    const result = { id: "9", name: "201", type: "group", typeLabel: "Группа" } as const;
    const now = new Date("2026-09-08T12:00:00Z");
    const first = await ensureCurrentWeekArchive({
      result: result as any,
      data: { v: 1, hasNextWeekMonday: true, nextWeekMonday: { dateRange: "14 — 14 сентября", weekLabel: "" } },
      now,
    });
    expect(first).toHaveLength(2);
    expect(first[0].weekPage).toBe(0);
    expect(first[1].weekPage).toBe(1);
    const again = await ensureCurrentWeekArchive({
      result: result as any,
      data: { v: 2, hasNextWeekMonday: true, nextWeekMonday: { dateRange: "14 — 14 сентября", weekLabel: "" } },
      now,
    });
    expect(again[0].id).toBe(first[0].id);
    expect(again[1].id).toBe(first[1].id);
    const list = JSON.parse(mem.get(WEEK_ARCHIVE_KEY) || "[]");
    expect(list).toHaveLength(2);
    expect(list.find((e: any) => e.weekPage === 0).data.v).toBe(2);
  });
});
