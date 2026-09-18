/** Оценки студента для подписей в расписании. */

import {
  formatGradeMarkDisplay,
  gradeMarkTextClass,
  isRedGradeMark,
} from "@/lib/client/journalGradeMarks";
import { isoToday } from "@/lib/client/teacherJournalGrid";

export type TimetableJournalSubject = {
  id?: string;
  name: string;
  shortName?: string;
  fullName?: string;
  gradesMatrix: Record<number, { value: string; kind?: string }[]>;
};

export type TimetableJournalData = {
  months: string[];
  monthColspans: number[];
  dates: string[];
  /** ISO YYYY-MM-DD если есть с API */
  dateKeys?: string[];
  subjects: TimetableJournalSubject[];
  dayTypes?: Record<number, string>;
  redAbsent?: Record<number, boolean>;
  labDueDates?: Record<number, string | null>;
  labCredited?: Record<number, boolean>;
};

export type TimetableGradeMark = {
  value: string;
  display: string;
  textClass: string;
  /** Фон только если учитель задал «красную» неявку / просроч. лаб. */
  backgroundColor?: string;
};

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

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function toIsoLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function inferYear(monthIdx: number, ref: Date): number {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  if (monthIdx === 0 && m === 11) return y + 1;
  if (monthIdx === 11 && m === 0) return y - 1;
  return y;
}

function monthIndexFromLabel(label: string): number {
  const low = label.toLowerCase();
  return MONTH_NAMES.findIndex(
    (m) => low.includes(m.slice(0, 3)) || m.includes(low.slice(0, 3))
  );
}

/** Восстанавливает ISO-даты колонок журнала, если API не отдал dateKeys. */
export function reconstructJournalDateKeys(
  months: string[],
  monthColspans: number[],
  dates: string[],
  refDate = new Date()
): string[] {
  const out: string[] = [];
  let col = 0;
  let prevMonth = -1;
  let year = refDate.getFullYear();
  const firstMi = months.length ? monthIndexFromLabel(months[0] ?? "") : -1;
  if (firstMi >= 0) year = inferYear(firstMi, refDate);

  for (let mi = 0; mi < months.length; mi++) {
    const monthIdx = monthIndexFromLabel(months[mi] ?? "");
    if (monthIdx < 0) {
      col += monthColspans[mi] ?? 0;
      continue;
    }
    if (prevMonth >= 0 && monthIdx < prevMonth) year += 1;
    prevMonth = monthIdx;
    const span = monthColspans[mi] ?? 0;
    for (let j = 0; j < span; j++) {
      const day = Number.parseInt(String(dates[col + j] ?? ""), 10);
      if (!Number.isFinite(day) || day < 1) {
        out.push("");
      } else {
        out.push(toIsoLocal(new Date(year, monthIdx, day)));
      }
    }
    col += span;
  }
  return out;
}

export function resolveJournalDateKeys(journal: TimetableJournalData, refDate = new Date()): string[] {
  if (Array.isArray(journal.dateKeys) && journal.dateKeys.length === journal.dates.length) {
    return journal.dateKeys.map((k) => String(k).slice(0, 10));
  }
  return reconstructJournalDateKeys(journal.months, journal.monthColspans, journal.dates, refDate);
}

export function normalizeSubjectLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.«»"'.,]/g, "");
}

export function subjectsMatch(a: string, b: string): boolean {
  const na = normalizeSubjectLabel(a);
  const nb = normalizeSubjectLabel(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 3 && nb.length >= 3 && (na.includes(nb) || nb.includes(na))) return true;
  return false;
}

function findSubject(journal: TimetableJournalData, subjectLabel: string): TimetableJournalSubject | null {
  const label = subjectLabel.trim();
  if (!label) return null;
  for (const s of journal.subjects) {
    if (
      subjectsMatch(label, s.name) ||
      (s.shortName && subjectsMatch(label, s.shortName)) ||
      (s.fullName && subjectsMatch(label, s.fullName))
    ) {
      return s;
    }
  }
  return null;
}

function labOverdueBg(journal: TimetableJournalData, col: number): string | undefined {
  const due = journal.labDueDates?.[col];
  if (!due) return undefined;
  if (journal.labCredited?.[col]) return undefined;
  const dayType = journal.dayTypes?.[col];
  if (dayType !== "lab" && dayType !== "okr") return undefined;
  if (due.slice(0, 10) < isoToday()) return "#fecaca";
  return undefined;
}

export function marksForSubjectOnDate(
  journal: TimetableJournalData | null | undefined,
  subjectLabel: string,
  isoDate: string
): TimetableGradeMark[] {
  if (!journal?.subjects?.length || !isoDate) return [];
  const keys = resolveJournalDateKeys(journal);
  const col = keys.findIndex((k) => k === isoDate.slice(0, 10));
  if (col < 0) return [];
  const subject = findSubject(journal, subjectLabel);
  if (!subject) return [];
  const cells = subject.gradesMatrix?.[col];
  if (!cells?.length) return [];

  const redDay = Boolean(journal.redAbsent?.[col]);
  const overdueBg = labOverdueBg(journal, col);

  const marks: TimetableGradeMark[] = [];
  for (const c of cells) {
    const value = String(c.value ?? "").trim();
    if (!value) continue;
    const labOkr = journal.dayTypes?.[col] === "lab" || journal.dayTypes?.[col] === "okr";
    const textClass = gradeMarkTextClass(value, { labOkrOnly: labOkr });
    // Вне journal-grid-shell классы не стилизуются — маппим в Tailwind
    const tw =
      textClass === "journal-grade-red" || (redDay && isRedGradeMark(value))
        ? "text-red-600 dark:text-red-400"
        : textClass === "journal-grade-zach"
          ? "text-green-700 dark:text-green-400"
          : textClass === "journal-grade-muted"
            ? "text-gray-400 dark:text-zinc-500"
            : "text-gray-800 dark:text-zinc-100";
    marks.push({
      value,
      display: formatGradeMarkDisplay(value),
      textClass: tw,
      backgroundColor: overdueBg,
    });
  }
  return marks;
}

export function isoDateForTimetableDay(
  weekDates: Date[],
  dayIndex: number
): string | null {
  if (dayIndex < 0 || dayIndex >= weekDates.length) return null;
  const d = weekDates[dayIndex];
  if (!d || Number.isNaN(d.getTime())) return null;
  return toIsoLocal(d);
}
