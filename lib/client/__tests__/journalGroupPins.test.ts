import { describe, expect, it } from "vitest";
import {
  parseManualPins,
  parseTodayGroups,
  pinRank,
  sortGroupsForSubject,
  toggleManualPin,
  isPinnedGroup,
} from "@/lib/client/journalGroupPins";

describe("journalGroupPins", () => {
  it("parses manual pins and clears on teacher mismatch", () => {
    expect(parseManualPins({ teacherId: 1, groupIds: [3, 2, 2, "x"] }, 1).groupIds).toEqual([3, 2]);
    expect(parseManualPins({ teacherId: 1, groupIds: [3] }, 9).groupIds).toEqual([]);
  });

  it("rolls today groups when date changes", () => {
    expect(parseTodayGroups({ date: "2026-01-01", groupIds: [5] }, "2026-01-02")).toEqual({
      date: "2026-01-02",
      groupIds: [],
    });
    expect(parseTodayGroups({ date: "2026-01-02", groupIds: [5, 5] }, "2026-01-02").groupIds).toEqual([
      5,
    ]);
  });

  it("toggles manual pin immutably", () => {
    expect(toggleManualPin([1, 2], 3)).toEqual([1, 2, 3]);
    expect(toggleManualPin([1, 2], 2)).toEqual([1]);
  });

  it("sorts curator > today > manual > rest", () => {
    const groups = [
      { id: 1, name: "Б" },
      { id: 2, name: "А" },
      { id: 3, name: "В" },
      { id: 4, name: "Г" },
    ];
    const meta = {
      curatorIds: new Set([3]),
      todayIds: new Set([1]),
      manualIds: new Set([4]),
    };
    expect(sortGroupsForSubject(groups, meta).map((g) => g.id)).toEqual([3, 1, 4, 2]);
    expect(pinRank(3, meta)).toBe(0);
    expect(isPinnedGroup(3, meta)).toBe(true);
    expect(isPinnedGroup(2, meta)).toBe(false);
  });
});
