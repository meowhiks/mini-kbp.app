import type { GradeRecord, GroupStudent } from "@/lib/client/miniKbpServer";

export type JournalCellGrade = { value: string; type?: string; kind?: string };

export type JournalGridRow = {
  id: number | string;
  name: string;
  fullName?: string;
  gradesMatrix: Record<number, JournalCellGrade[]>;
};

/** Размеры ячеек студенческого журнала (KBP ×2 ÷ 1.5). */
export const STUDENT_MARK_CELL_W = 31;
export const STUDENT_MARK_CELL_H = 36;
/** @deprecated используйте STUDENT_MARK_CELL_W */
export const STUDENT_MARK_CELL_PX = STUDENT_MARK_CELL_W;
export const STUDENT_MARK_CELL_DENSE_W = 27;
export const STUDENT_MARK_CELL_DENSE_H = 32;
/** @deprecated используйте STUDENT_MARK_CELL_DENSE_W */
export const STUDENT_MARK_CELL_DENSE_PX = STUDENT_MARK_CELL_DENSE_W;
export const STUDENT_SUBJECT_COL_PX = 96;
export const STUDENT_AVG_COL_PX = 40;
export const STUDENT_SUBJECT_GAP_PX = 1;
export const STUDENT_ROW_H = 36;

export const JOURNAL_SCALE_DEFAULT = 100;
export const JOURNAL_SCALE_MIN = 70;
export const JOURNAL_SCALE_MAX = 130;

export function clampJournalScalePercent(value: number): number {
  if (!Number.isFinite(value)) return JOURNAL_SCALE_DEFAULT;
  return Math.min(JOURNAL_SCALE_MAX, Math.max(JOURNAL_SCALE_MIN, Math.round(value)));
}

export function scaleJournalPx(px: number, scalePercent: number): number {
  return Math.round(px * clampJournalScalePercent(scalePercent) / 100);
}

export type JournalGridData = {
  months: string[];
  monthColspans: number[];
  dates: string[];
  dateKeys: string[];
  rows: JournalGridRow[];
  todayIndex: number | null;
  suggestAddKey: string | null;
  dayTypes?: Record<number, "normal" | "lab" | "okr">;
  footerNotes?: Record<number, string>;
};

export const SPECIAL_DAY_BG = "#e0f2fe";

const MONTH_NAMES = [
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
];

function monthLabel(d: Date): string {
  return MONTH_NAMES[d.getMonth()] ?? "";
}

function isoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDay(iso: string): string {
  return String(parseIso(iso).getDate());
}

/** Следующий учебный день (пропуск воскресенья). */
export function suggestNextDate(existing: string[]): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const set = new Set(existing);
  let d = existing.length ? parseIso(existing[existing.length - 1]) : today;
  if (existing.length) d.setDate(d.getDate() + 1);
  for (let i = 0; i < 14; i++) {
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    const key = isoLocal(d);
    if (!set.has(key)) return key;
    d.setDate(d.getDate() + 1);
  }
  return isoLocal(today);
}

function buildMonthHeaders(dateKeys: string[]): { months: string[]; monthColspans: number[] } {
  const months: string[] = [];
  const monthColspans: number[] = [];
  let last = "";
  for (const key of dateKeys) {
    const m = monthLabel(parseIso(key));
    if (m !== last) {
      months.push(m);
      monthColspans.push(1);
      last = m;
    } else {
      monthColspans[monthColspans.length - 1] += 1;
    }
  }
  return { months, monthColspans };
}

export function buildTeacherJournalGrid(
  students: GroupStudent[],
  grades: GradeRecord[],
  extraDateKeys: string[] = []
): JournalGridData {
  const dateSet = new Set<string>();
  for (const g of grades) dateSet.add(g.date);
  for (const d of extraDateKeys) dateSet.add(d);
  const dateKeys = [...dateSet].sort();
  const todayKey = isoLocal(new Date());
  const todayIndex = dateKeys.indexOf(todayKey);

  const gradeByStudentDate = new Map<string, { slot: number; value: string }[]>();
  for (const g of grades) {
    const key = `${g.student}:${g.date.slice(0, 10)}`;
    const list = gradeByStudentDate.get(key) ?? [];
    list.push({ slot: g.slot ?? 0, value: g.value });
    gradeByStudentDate.set(key, list);
  }
  for (const [, list] of gradeByStudentDate) {
    list.sort((a, b) => a.slot - b.slot);
  }

  const rows: JournalGridRow[] = students.map((st) => {
    const gradesMatrix: Record<number, JournalCellGrade[]> = {};
    dateKeys.forEach((key, idx) => {
      const cells = gradeByStudentDate.get(`${st.id}:${key}`);
      if (cells?.length) gradesMatrix[idx] = cells.map((c) => ({ value: c.value }));
    });
    return { id: st.id, name: st.full_name, gradesMatrix };
  });

  const { months, monthColspans } = buildMonthHeaders(dateKeys);

  return {
    months,
    monthColspans,
    dates: dateKeys.map(formatDay),
    dateKeys,
    rows,
    todayIndex: todayIndex >= 0 ? todayIndex : null,
    suggestAddKey: suggestNextDate(dateKeys),
  };
}

/** Добавить колонку даты в существующую сетку. */
export function addDateToGrid(grid: JournalGridData, isoDate: string): JournalGridData {
  if (grid.dateKeys.includes(isoDate)) return grid;
  const dateKeys = [...grid.dateKeys, isoDate].sort();
  const idxMap = new Map(grid.dateKeys.map((k, i) => [k, i]));
  const rows = grid.rows.map((row) => {
    const gradesMatrix: Record<number, JournalCellGrade[]> = {};
    dateKeys.forEach((key, newIdx) => {
      const oldIdx = idxMap.get(key);
      if (oldIdx !== undefined && row.gradesMatrix[oldIdx]) {
        gradesMatrix[newIdx] = row.gradesMatrix[oldIdx];
      }
    });
    return { ...row, gradesMatrix };
  });
  const { months, monthColspans } = buildMonthHeaders(dateKeys);
  const todayKey = isoLocal(new Date());
  return {
    months,
    monthColspans,
    dates: dateKeys.map(formatDay),
    dateKeys,
    rows,
    todayIndex: dateKeys.indexOf(todayKey),
    suggestAddKey: suggestNextDate(dateKeys),
  };
}

/** Индекс «сегодня» для студенческого журнала (по дню месяца + месяцу). */
export function findTodayIndexStudent(
  dates: string[],
  monthColspans: number[],
  months: string[]
): number | null {
  const now = new Date();
  const day = String(now.getDate());
  const monthName = MONTH_NAMES[now.getMonth()];
  let col = 0;
  for (let mi = 0; mi < months.length; mi++) {
    const span = monthColspans[mi] ?? 0;
    const monthMatch =
      months[mi]?.toLowerCase().includes(monthName.slice(0, 4)) ||
      monthName.includes(months[mi]?.toLowerCase().slice(0, 4) ?? "");
    if (monthMatch) {
      for (let j = 0; j < span; j++) {
        if (dates[col + j] === day) return col + j;
      }
    }
    col += span;
  }
  for (let i = 0; i < dates.length; i++) {
    if (dates[i] === day) return i;
  }
  return null;
}
