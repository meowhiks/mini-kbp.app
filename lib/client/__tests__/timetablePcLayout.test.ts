import { describe, expect, it } from "vitest";
import { timetablePcSidePadClass } from "@/lib/client/timetablePcLayout";

describe("timetablePcSidePadClass", () => {
  it("adds horizontal inset only on PC when the setting is on", () => {
    expect(timetablePcSidePadClass({ isPc: true, enabled: true })).toBe("px-8 lg:px-20");
    expect(timetablePcSidePadClass({ isPc: true, enabled: false })).toBe("");
    expect(timetablePcSidePadClass({ isPc: false, enabled: true })).toBe("");
  });
});
