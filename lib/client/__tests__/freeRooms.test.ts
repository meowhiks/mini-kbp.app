import { describe, expect, it } from "vitest";
import {
  resolveCurrentLessonNumber,
  resolveFreeRoomsDayIndex,
} from "@/lib/client/freeRooms";

describe("resolveFreeRoomsDayIndex", () => {
  it("returns null on Sunday for now", () => {
    const sunday = new Date(2026, 8, 13);
    expect(sunday.getDay()).toBe(0);
    expect(resolveFreeRoomsDayIndex({ when: "now" }, sunday)).toBeNull();
  });

  it("maps Monday now to 0", () => {
    const monday = new Date(2026, 8, 14);
    expect(monday.getDay()).toBe(1);
    expect(resolveFreeRoomsDayIndex({ when: "now" }, monday)).toBe(0);
  });

  it("skips Sunday when tomorrow is Sunday", () => {
    const saturday = new Date(2026, 8, 12);
    expect(saturday.getDay()).toBe(6);
    expect(resolveFreeRoomsDayIndex({ when: "tomorrow" }, saturday)).toBe(0);
  });
});

describe("resolveCurrentLessonNumber", () => {
  it("finds lesson during morning window on Monday", () => {
    const mondayMorning = new Date(2026, 8, 14, 8, 30, 0);
    const n = resolveCurrentLessonNumber(0, mondayMorning);
    expect(n).toBeTypeOf("number");
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(13);
  });
});
