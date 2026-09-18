/** Специальные отметки в журнале */

export type GradeMarkOption = {
  value: string;
  label: string;
  /** Красная «н» — неявка без уважительной */
  red?: boolean;
};

export const SPECIAL_GRADE_MARKS: GradeMarkOption[] = [
  { value: "н", label: "н" },
  { value: "н.", label: "н", red: true },
  { value: "зач", label: "зач" },
];

const RED_MARKS = new Set(["н.", "н. зач."]);
const NON_NUMERIC_MARKS = new Set(["н", "н.", "н. зач.", "зач"]);

export function isRedGradeMark(value: string): boolean {
  const v = value.trim().toLowerCase();
  return RED_MARKS.has(v);
}

export function isNonNumericGradeMark(value: string): boolean {
  return NON_NUMERIC_MARKS.has(value.trim().toLowerCase());
}

/** @deprecated используйте isRedGradeMark */
export function isSpecialGradeMark(value: string): boolean {
  return isRedGradeMark(value);
}

export function gradeMarkTextClass(value: string, opts?: { labOkrOnly?: boolean }): string {
  const v = value.trim().toLowerCase();
  if (isRedGradeMark(value)) return "journal-grade-red";
  if (v === "зач") return opts?.labOkrOnly ? "journal-grade-zach" : "journal-grade-value";
  if (v === "н") return "journal-grade-muted";
  return "journal-grade-value";
}

export function gradeMarkMatches(current: string, option: GradeMarkOption): boolean {
  return current.trim().toLowerCase() === option.value.toLowerCase();
}

/** Как показывать отметку в ячейке (без лишних символов) */
export function formatGradeMarkDisplay(value: string): string {
  const v = value.trim().toLowerCase();
  if (v === "н.") return "н";
  if (v === "н. зач.") return "зач";
  return value;
}
