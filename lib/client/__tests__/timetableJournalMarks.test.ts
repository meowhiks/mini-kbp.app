import { describe, expect, it } from "vitest";
import {
  marksForSubjectOnDate,
  normalizeSubjectLabel,
  reconstructJournalDateKeys,
  subjectsMatch,
  toIsoLocal,
} from "@/lib/client/timetableJournalMarks";

describe("timetableJournalMarks", () => {
  it("reconstructs ISO dates across months", () => {
    const keys = reconstructJournalDateKeys(
      ["декабрь", "январь"],
      [2, 2],
      ["30", "31", "1", "2"],
      new Date(2025, 11, 15)
    );
    expect(keys).toEqual(["2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02"]);
  });

  it("matches subject labels loosely", () => {
    expect(subjectsMatch("Математика", "математика")).toBe(true);
    expect(subjectsMatch("Инф.", "Информатика")).toBe(true);
    expect(normalizeSubjectLabel("  А  Б ")).toBe("а б");
  });

  it("returns styled marks for date+subject", () => {
    const iso = toIsoLocal(new Date(2026, 0, 12));
    const journal = {
      months: ["январь"],
      monthColspans: [1],
      dates: ["12"],
      dateKeys: [iso],
      dayTypes: { 0: "normal" },
      subjects: [
        {
          name: "Мат",
          fullName: "Математика",
          gradesMatrix: { 0: [{ value: "8" }, { value: "н." }] },
        },
      ],
    };
    const marks = marksForSubjectOnDate(journal, "Математика", iso);
    expect(marks.map((m) => m.display)).toEqual(["8", "н"]);
    expect(marks[1].textClass).toContain("red");
  });
});
