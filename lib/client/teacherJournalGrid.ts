import type { GradeRecord, GroupStudent } from "@/lib/client/miniKbpServer";
import type { JournalDayRecord } from "@/lib/client/teacherJournal";
import { normDate } from "@/lib/client/teacherJournal";

export type TeacherJournalCell = {
  value: string;
  saved?: boolean;
  id?: number;
  slot?: number;
};

export type JournalColumn = { date: string; slot: number };

export type TeacherJournalGridData = {
  months: string[];
  monthColspans: number[];
  dates: string[];
  columns: JournalColumn[];
  /** ISO-дата каждой колонки (может повторяться) */
  dateKeys: string[];
  /** Слот урока для каждой колонки */
  columnSlots: number[];
  dayTypes: Record<number, "normal" | "lab" | "okr">;
  footerNotes: Record<number, string>;
  dayIds: Record<number, number>;
  labDueDates: Record<number, string | null>;
  labCredited: Record<number, boolean>;
  redAbsent: Record<number, boolean>;
  rows: {
    id: number;
    name: string;
    gradesMatrix: Record<number, TeacherJournalCell[]>;
  }[];
  todayIndex: number | null;
};

const MONTH_NAMES = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
];

export function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Срок сдачи лаб./ОКР по умолчанию: сегодня + 2 недели. */
export function defaultLabDueDate(from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + 14);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthLabel(d: Date): string {
  return MONTH_NAMES[d.getMonth()] ?? "";
}

function parseIso(iso: string): Date {
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(y, m - 1, day);
}

function formatDayMonth(iso: string): string {
  const d = parseIso(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}`;
}

/** Подпись в шапке таблицы — только число */
function formatColumnLabel(col: JournalColumn): string {
  return String(parseIso(col.date).getDate());
}

/** Полная дата для меню колонки: «28.07» */
export function formatColumnDateFull(iso: string): string {
  return formatDayMonth(iso);
}

export function columnKey(col: JournalColumn): string {
  return `${col.date}:${col.slot}`;
}

export function sortColumns(cols: JournalColumn[]): JournalColumn[] {
  return [...cols].sort((a, b) => a.date.localeCompare(b.date) || a.slot - b.slot);
}

function buildMonthHeaders(columnDates: string[]) {
  const months: string[] = [];
  const monthColspans: number[] = [];
  let last = "";
  for (const key of columnDates) {
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

function finalizeGrid(
  columns: JournalColumn[],
  dayTypes: Record<number, "normal" | "lab" | "okr">,
  footerNotes: Record<number, string>,
  dayIds: Record<number, number>,
  labDueDates: Record<number, string | null>,
  labCredited: Record<number, boolean>,
  redAbsent: Record<number, boolean>,
  rows: TeacherJournalGridData["rows"]
): TeacherJournalGridData {
  const sorted = sortColumns(columns);
  const dateKeys = sorted.map((c) => c.date);
  const columnSlots = sorted.map((c) => c.slot);
  const { months, monthColspans } = buildMonthHeaders(dateKeys);
  const todayKey = isoToday();
  let todayIndex: number | null = null;
  for (let i = dateKeys.length - 1; i >= 0; i--) {
    if (dateKeys[i] === todayKey) {
      todayIndex = i;
      break;
    }
  }

  return {
    months,
    monthColspans,
    dates: sorted.map((col) => formatColumnLabel(col)),
    columns: sorted,
    dateKeys,
    columnSlots,
    dayTypes,
    footerNotes,
    dayIds,
    labDueDates,
    labCredited,
    redAbsent,
    rows,
    todayIndex,
  };
}

export function buildTeacherGridFromBundle(
  students: GroupStudent[] | { id: number; full_name: string }[],
  grades: GradeRecord[] | { student: number; date: string; slot?: number; value: string; id?: number }[],
  days: JournalDayRecord[]
): TeacherJournalGridData {
  const colMap = new Map<string, JournalColumn>();
  for (const d of days) {
    const date = normDate(d.date);
    const slot = d.slot ?? 0;
    colMap.set(columnKey({ date, slot }), { date, slot });
  }
  for (const g of grades) {
    if (!g.value) continue;
    const date = normDate(g.date);
    const slot = g.slot ?? 0;
    colMap.set(columnKey({ date, slot }), { date, slot });
  }
  const columns = sortColumns([...colMap.values()]);

  const gradeMap = new Map<string, TeacherJournalCell>();
  for (const g of grades) {
    if (!g.value) continue;
    const date = normDate(g.date);
    const slot = g.slot ?? 0;
    gradeMap.set(`${g.student}:${date}:${slot}`, {
      value: g.value,
      saved: true,
      id: g.id,
      slot,
    });
  }

  const dayTypes: Record<number, "normal" | "lab" | "okr"> = {};
  const footerNotes: Record<number, string> = {};
  const dayIds: Record<number, number> = {};
  const labDueDates: Record<number, string | null> = {};
  const labCredited: Record<number, boolean> = {};
  const redAbsent: Record<number, boolean> = {};
  columns.forEach((col, idx) => {
    const day = days.find((d) => normDate(d.date) === col.date && (d.slot ?? 0) === col.slot);
    dayTypes[idx] = (day?.day_type as "normal" | "lab" | "okr") ?? "normal";
    footerNotes[idx] = day?.footer_note ?? "";
    if (day?.id) dayIds[idx] = day.id;
    labDueDates[idx] = day?.lab_due_date ?? null;
    labCredited[idx] = Boolean(day?.lab_credited);
    redAbsent[idx] = Boolean(day?.red_absent);
  });

  const rows = students.map((st) => {
    const gradesMatrix: Record<number, TeacherJournalCell[]> = {};
    columns.forEach((col, idx) => {
      const cell = gradeMap.get(`${st.id}:${col.date}:${col.slot}`);
      if (cell) gradesMatrix[idx] = [cell];
    });
    return { id: st.id, name: st.full_name, gradesMatrix };
  });

  return finalizeGrid(columns, dayTypes, footerNotes, dayIds, labDueDates, labCredited, redAbsent, rows);
}

function rebuildWithColumns(
  grid: TeacherJournalGridData,
  columns: JournalColumn[]
): TeacherJournalGridData {
  const sorted = sortColumns(columns);
  const idxMap = new Map(grid.columns.map((c, i) => [columnKey(c), i]));

  const rows = grid.rows.map((row) => {
    const gradesMatrix: Record<number, TeacherJournalCell[]> = {};
    sorted.forEach((col, newIdx) => {
      const oldIdx = idxMap.get(columnKey(col));
      if (oldIdx !== undefined && row.gradesMatrix[oldIdx]) {
        gradesMatrix[newIdx] = row.gradesMatrix[oldIdx];
      }
    });
    return { ...row, gradesMatrix };
  });

  const dayTypes: Record<number, "normal" | "lab" | "okr"> = {};
  const footerNotes: Record<number, string> = {};
  const dayIds: Record<number, number> = {};
  const labDueDates: Record<number, string | null> = {};
  const labCredited: Record<number, boolean> = {};
  const redAbsent: Record<number, boolean> = {};
  sorted.forEach((col, newIdx) => {
    const oldIdx = idxMap.get(columnKey(col));
    if (oldIdx !== undefined) {
      dayTypes[newIdx] = grid.dayTypes[oldIdx] ?? "normal";
      footerNotes[newIdx] = grid.footerNotes[oldIdx] ?? "";
      if (grid.dayIds[oldIdx]) dayIds[newIdx] = grid.dayIds[oldIdx];
      labDueDates[newIdx] = grid.labDueDates[oldIdx] ?? null;
      labCredited[newIdx] = grid.labCredited[oldIdx] ?? false;
      redAbsent[newIdx] = grid.redAbsent[oldIdx] ?? false;
    } else {
      dayTypes[newIdx] = "normal";
      footerNotes[newIdx] = "";
      labDueDates[newIdx] = null;
      labCredited[newIdx] = false;
      redAbsent[newIdx] = false;
    }
  });

  return finalizeGrid(sorted, dayTypes, footerNotes, dayIds, labDueDates, labCredited, redAbsent, rows);
}

/** Новая дата (слот 0) или ещё один урок в этот день, если дата уже есть */
export function addDateColumn(grid: TeacherJournalGridData, isoDate: string): TeacherJournalGridData {
  const date = normDate(isoDate);
  const sameDate = grid.columns.filter((c) => c.date === date);
  if (!sameDate.length) {
    return rebuildWithColumns(grid, [...grid.columns, { date, slot: 0 }]);
  }
  return addLessonColumn(
    grid,
    grid.columns.findIndex((c) => c.date === date && c.slot === Math.max(...sameDate.map((x) => x.slot)))
  );
}

export function addLessonColumn(grid: TeacherJournalGridData, colIndex: number): TeacherJournalGridData {
  const col = grid.columns[colIndex];
  if (!col) return grid;
  const maxSlot = Math.max(...grid.columns.filter((c) => c.date === col.date).map((c) => c.slot));
  return rebuildWithColumns(grid, [...grid.columns, { date: col.date, slot: maxSlot + 1 }]);
}

export function addTodayColumn(grid: TeacherJournalGridData): TeacherJournalGridData {
  return addDateColumn(grid, isoToday());
}

export function removeDateColumn(grid: TeacherJournalGridData, dateIndex: number): TeacherJournalGridData {
  const columns = grid.columns.filter((_, i) => i !== dateIndex);
  return rebuildWithColumns(grid, columns);
}

export function filterLabOkrTeacherGrid(grid: TeacherJournalGridData): TeacherJournalGridData {
  const keepIdx = Object.entries(grid.dayTypes)
    .filter(([, t]) => t === "lab" || t === "okr")
    .map(([i]) => Number(i));
  const columns = keepIdx.map((i) => grid.columns[i]).filter(Boolean);
  return rebuildWithColumns(grid, columns);
}

export function isLabColumnOverdue(grid: TeacherJournalGridData, dateIdx: number): boolean {
  const t = grid.dayTypes[dateIdx];
  if (t !== "lab" && t !== "okr") return false;
  if (grid.labCredited[dateIdx]) return false;
  const due = grid.labDueDates[dateIdx];
  if (!due) return false;
  const today = isoToday();
  return due.slice(0, 10) < today;
}

export function applyLocalGrade(
  grid: TeacherJournalGridData,
  studentId: number,
  dateIndex: number,
  value: string,
  opts?: { id?: number; clearRedAbsent?: boolean }
): TeacherJournalGridData {
  const saveValue = value.trim();
  const slot = grid.columns[dateIndex]?.slot ?? 0;
  const rows = grid.rows.map((row) => {
    if (row.id !== studentId) return row;
    const gradesMatrix = { ...row.gradesMatrix };
    if (saveValue) {
      gradesMatrix[dateIndex] = [{ value: saveValue, saved: false, slot, id: opts?.id }];
    } else {
      delete gradesMatrix[dateIndex];
    }
    return { ...row, gradesMatrix };
  });
  const redAbsent = opts?.clearRedAbsent ? { ...grid.redAbsent, [dateIndex]: false } : grid.redAbsent;
  return { ...grid, rows, redAbsent };
}

export function markGradeSaved(
  grid: TeacherJournalGridData,
  studentId: number,
  dateIndex: number,
  id?: number
): TeacherJournalGridData {
  const rows = grid.rows.map((row) => {
    if (row.id !== studentId) return row;
    const cells = row.gradesMatrix[dateIndex];
    if (!cells?.[0]) return row;
    const gradesMatrix = {
      ...row.gradesMatrix,
      [dateIndex]: [{ ...cells[0], saved: true, id: id ?? cells[0].id }],
    };
    return { ...row, gradesMatrix };
  });
  return { ...grid, rows };
}

export const SPECIAL_DAY_BG = "#e0f2fe";
export const LAB_OVERDUE_BG = "#fecaca";
export const LAB_CREDITED_TEACHER_BG = "#bbf7d0";
export const SAVED_CELL_BG = "#dcfce7";
