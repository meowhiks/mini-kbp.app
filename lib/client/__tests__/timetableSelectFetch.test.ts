import { describe, expect, it } from "vitest";
import { shouldDirectFetchAfterTimetableUrlPush } from "@/lib/client/timetableSelectFetch";

describe("shouldDirectFetchAfterTimetableUrlPush", () => {
  it("requires a direct fetch when URL push sets the skip-ref", () => {
    expect(shouldDirectFetchAfterTimetableUrlPush({ urlPushSetsSkipRef: true })).toBe(true);
  });

  it("does not require a second fetch when the URL effect will load", () => {
    expect(shouldDirectFetchAfterTimetableUrlPush({ urlPushSetsSkipRef: false })).toBe(false);
  });
});
