import { describe, expect, it } from "vitest";
import {
  JOURNAL_MENU_BACKDROP_DEFAULT,
  parseJournalMenuBackdrop,
} from "@/lib/client/journalMenuBackdrop";

describe("parseJournalMenuBackdrop", () => {
  it("accepts known modes", () => {
    expect(parseJournalMenuBackdrop("blur")).toBe("blur");
    expect(parseJournalMenuBackdrop("dim")).toBe("dim");
    expect(parseJournalMenuBackdrop("off")).toBe("off");
  });

  it("falls back for invalid values", () => {
    expect(parseJournalMenuBackdrop(undefined)).toBe(JOURNAL_MENU_BACKDROP_DEFAULT);
    expect(parseJournalMenuBackdrop("glow")).toBe(JOURNAL_MENU_BACKDROP_DEFAULT);
  });
});
