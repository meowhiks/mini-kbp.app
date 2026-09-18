import { describe, expect, it } from "vitest";
import { dayHasReplacements } from "@/lib/client/timetableDayReplacements";

describe("dayHasReplacements", () => {
  it("uses dayReplacementStatus.hasChanges", () => {
    const tt = {
      dayReplacementStatus: [
        { hasChanges: false, noChanges: true },
        { hasChanges: true, noChanges: false },
      ],
      pairs: [],
    };
    expect(dayHasReplacements(tt, 0)).toBe(false);
    expect(dayHasReplacements(tt, 1)).toBe(true);
  });

  it("detects replaced pair when status flag missing", () => {
    const tt = {
      pairs: [{ day: 5, pairNumber: 1, status: "replaced", subject: "X" }],
    };
    expect(dayHasReplacements(tt, 5)).toBe(true);
    expect(dayHasReplacements(tt, 0)).toBe(false);
  });
});
