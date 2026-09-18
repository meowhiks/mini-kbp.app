import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAutosaveScheduler,
  fingerprintAdminRow,
  mergeAdminEditDrafts,
} from "@/lib/client/adminAutosave";

describe("fingerprintAdminRow", () => {
  it("treats the same payload as unchanged", () => {
    expect(fingerprintAdminRow({ name: "А" })).toBe(fingerprintAdminRow({ name: "А" }));
  });
});

describe("mergeAdminEditDrafts", () => {
  it("keeps dirty rows and applies server rows for the rest", () => {
    const prev = {
      1: { name: "локально" },
      2: { name: "старое" },
    };
    const list = [
      { id: 1, name: "с сервера 1" },
      { id: 2, name: "с сервера 2" },
      { id: 3, name: "новый" },
    ];
    const next = mergeAdminEditDrafts(prev, list, new Set([1]), (row) => ({ name: row.name }));
    expect(next[1]).toEqual({ name: "локально" });
    expect(next[2]).toEqual({ name: "с сервера 2" });
    expect(next[3]).toEqual({ name: "новый" });
  });

  it("drops rows deleted on the server unless they are dirty", () => {
    const prev = { 1: { name: "есть" }, 9: { name: "черновик" } };
    const next = mergeAdminEditDrafts(prev, [{ id: 1, name: "есть" }], new Set([9]), (row) => ({
      name: row.name,
    }));
    expect(next[1]).toEqual({ name: "есть" });
    expect(next[9]).toEqual({ name: "черновик" });
  });
});

describe("createAutosaveScheduler", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not save until the debounce delay", () => {
    vi.useFakeTimers();
    const scheduler = createAutosaveScheduler(200);
    const save = vi.fn();
    scheduler.schedule(1, { name: "A" }, save);
    vi.advanceTimersByTime(199);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledTimes(1);
    scheduler.cancel();
  });

  it("skips save when the payload matches the last saved fingerprint", () => {
    vi.useFakeTimers();
    const scheduler = createAutosaveScheduler(50);
    const save = vi.fn();
    scheduler.markSaved(1, { name: "A" });
    scheduler.schedule(1, { name: "A" }, save);
    vi.advanceTimersByTime(100);
    expect(save).not.toHaveBeenCalled();
    scheduler.cancel();
  });

  it("cancels a pending save if the user reverts to the saved value", () => {
    vi.useFakeTimers();
    const scheduler = createAutosaveScheduler(80);
    const save = vi.fn();
    scheduler.markSaved(1, { name: "A" });
    scheduler.schedule(1, { name: "B" }, save);
    vi.advanceTimersByTime(40);
    scheduler.schedule(1, { name: "A" }, save);
    vi.advanceTimersByTime(100);
    expect(save).not.toHaveBeenCalled();
    scheduler.cancel();
  });
});
