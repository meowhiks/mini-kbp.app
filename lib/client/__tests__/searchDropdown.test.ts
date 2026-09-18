import { describe, expect, it } from "vitest";
import { shouldKeepSearchDropdownClosed } from "@/lib/client/searchDropdown";

describe("shouldKeepSearchDropdownClosed", () => {
  it("closes after a pick while the query still equals the chosen name", () => {
    expect(shouldKeepSearchDropdownClosed("ИС-21", "ИС-21")).toBe(true);
  });

  it("allows the list again when the user edits the query", () => {
    expect(shouldKeepSearchDropdownClosed("ИС-2", "ИС-21")).toBe(false);
    expect(shouldKeepSearchDropdownClosed("ИС-21", null)).toBe(false);
  });
});
