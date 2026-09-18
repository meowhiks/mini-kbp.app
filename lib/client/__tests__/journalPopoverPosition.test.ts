import { describe, expect, it } from "vitest";
import { placeJournalPopover } from "@/lib/client/journalPopoverPosition";

describe("placeJournalPopover", () => {
  const viewport = { width: 800, height: 600 };

  it("opens under the cell when there is room below", () => {
    const pos = placeJournalPopover(
      { top: 80, left: 200, width: 40, height: 28 },
      { menuWidth: 248, menuHeight: 280, viewport }
    );
    expect(pos.top).toBeGreaterThan(80 + 28);
    expect(pos.left).toBeGreaterThanOrEqual(8);
    expect(pos.left + 248).toBeLessThanOrEqual(viewport.width - 8);
  });

  it("flips above the cell near the bottom of the screen", () => {
    const pos = placeJournalPopover(
      { top: 520, left: 200, width: 40, height: 28 },
      { menuWidth: 248, menuHeight: 280, viewport }
    );
    expect(pos.top).toBeLessThan(520);
  });
});
