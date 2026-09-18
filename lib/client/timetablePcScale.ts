const STORAGE_KEY = "timetable_pc_col_widths_v2";

export const TIMETABLE_PC_ROW_H = 96;
/** Выше, чтобы в заголовке дня поместилась галочка «Показать замены». */
export const TIMETABLE_PC_HDR_H = 58;
export const TIMETABLE_PC_COL_MIN = 72;
export const TIMETABLE_PC_WEEK_COLS = 6;

const FR_MIN = 0.35;
const FR_MAX = 3;

/** Относительные доли ширины (fr) — сетка всегда 100% без горизонтального скролла. */
export function clampColFr(value: number): number {
  return Math.max(FR_MIN, Math.min(FR_MAX, value));
}

function normalizeStoredWidths(raw: number[]): number[] {
  const avg = raw.reduce((a, b) => a + b, 0) / raw.length;
  if (!Number.isFinite(avg) || avg <= 0) {
    return Array.from({ length: TIMETABLE_PC_WEEK_COLS }, () => 1);
  }
  return raw.map((w) => clampColFr(w / avg));
}

export function defaultColFr(): number[] {
  return Array.from({ length: TIMETABLE_PC_WEEK_COLS }, () => 1);
}

export function readTimetablePcColWidths(): number[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length === TIMETABLE_PC_WEEK_COLS) {
        const nums = parsed.map((x) => Number(x));
        if (!nums.some((n) => !Number.isFinite(n))) return normalizeStoredWidths(nums);
      }
    }
    const legacy = localStorage.getItem("timetable_pc_col_widths_v1");
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if (Array.isArray(parsed) && parsed.length === TIMETABLE_PC_WEEK_COLS) {
        const nums = parsed.map((x) => Number(x));
        if (!nums.some((n) => !Number.isFinite(n))) return normalizeStoredWidths(nums);
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function writeTimetablePcColWidths(widths: number[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widths.map(clampColFr)));
  } catch {
    /* ignore */
  }
}
