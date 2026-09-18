import { describe, expect, it } from "vitest";
import {
  applyLocalGrade,
  buildTeacherGridFromBundle,
  markGradeSaved,
} from "@/lib/client/teacherJournalGrid";

function sampleGrid() {
  return buildTeacherGridFromBundle(
    [{ id: 7, full_name: "Иванов" }],
    [{ student: 7, date: "2026-08-19", slot: 0, value: "8", id: 11 }],
    [{ id: 1, assignment: 1, date: "2026-08-19", slot: 0, day_type: "normal", footer_note: "" }]
  );
}

describe("applyLocalGrade", () => {
  it("updates the cell immediately without waiting for a server id", () => {
    const grid = sampleGrid();
    const next = applyLocalGrade(grid, 7, 0, "9");
    expect(next.rows[0].gradesMatrix[0][0].value).toBe("9");
    expect(next.rows[0].gradesMatrix[0][0].saved).toBe(false);
    expect(grid.rows[0].gradesMatrix[0][0].value).toBe("8");
  });

  it("clears a cell when value is empty", () => {
    const grid = sampleGrid();
    const next = applyLocalGrade(grid, 7, 0, "");
    expect(next.rows[0].gradesMatrix[0]).toBeUndefined();
  });

  it("marks the cell saved after a successful round-trip", () => {
    const grid = applyLocalGrade(sampleGrid(), 7, 0, "10");
    const saved = markGradeSaved(grid, 7, 0, 42);
    expect(saved.rows[0].gradesMatrix[0][0].saved).toBe(true);
    expect(saved.rows[0].gradesMatrix[0][0].id).toBe(42);
  });
});
