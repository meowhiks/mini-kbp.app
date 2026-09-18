/** Индекс колонки/дня: 0–5 текущая неделя (Пн–Сб), 6 — понедельник из right_week */
export const TIMETABLE_SLOT_NEXT_MONDAY = 6;

/** Живой календарный день: 0=Пн…5=Сб; в воскресенье уроков нет → -1. */
export function getLiveCalendarDayIndex(date: Date = new Date()): number {
  const dow = date.getDay(); // 0=вс
  if (dow === 0) return -1;
  return dow - 1;
}

export type TimetableWeekMeta = {
  dateRange: string;
  weekLabel: string;
};

export type TimetablePairLike = {
  day: number;
  weekOffset?: number;
};

export function getTimetableDisplayDay(pair: TimetablePairLike): number {
  if ((pair.weekOffset ?? 0) === 1 && pair.day === 0) return TIMETABLE_SLOT_NEXT_MONDAY;
  return pair.day;
}

export function pairMatchesDisplayDay(pair: TimetablePairLike, displayDay: number): boolean {
  return getTimetableDisplayDay(pair) === displayDay;
}

export function hasNextWeekMondayColumn(data: {
  hasNextWeekMonday?: boolean;
  hasNextWeek?: boolean;
  nextWeekMonday?: TimetableWeekMeta;
  pairs?: TimetablePairLike[];
} | null | undefined): boolean {
  if (!data) return false;
  if (data.hasNextWeekMonday) return true;
  if (data.nextWeekMonday?.dateRange || data.nextWeekMonday?.weekLabel) return true;
  if (data.hasNextWeek && (data.pairs || []).some((p) => (p.weekOffset ?? 0) === 1 && p.day === 0)) {
    return true;
  }
  return (data.pairs || []).some((p) => (p.weekOffset ?? 0) === 1 && p.day === 0);
}

export function getTimetableDayCount(data: Parameters<typeof hasNextWeekMondayColumn>[0]): number {
  return hasNextWeekMondayColumn(data) ? 7 : 6;
}

export function getTimetableDayLabels(data: Parameters<typeof hasNextWeekMondayColumn>[0]): string[] {
  const base = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
  if (!hasNextWeekMondayColumn(data)) return base;
  return [...base, "Понедельник"];
}

export function getTimetableDayShortLabels(data: Parameters<typeof hasNextWeekMondayColumn>[0]): string[] {
  const base = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  if (!hasNextWeekMondayColumn(data)) return base;
  return [...base, "Пн"];
}

/** Колонка недельной сетки на ПК: weekPage 0 — текущая неделя, 1 — след. (только Пн из right_week). */
export function getWeekGridDisplayDay(weekPage: number, columnIndex: number): number | null {
  if (weekPage === 0) {
    if (columnIndex >= 0 && columnIndex <= 5) return columnIndex;
    return null;
  }
  if (weekPage === 1 && columnIndex === 0) return TIMETABLE_SLOT_NEXT_MONDAY;
  return null;
}

/** Дополняет флаги из уже сохранённых pairs (старый кэш) */
export function normalizeTimetableData(data: any): any {
  if (!data || !Array.isArray(data.pairs)) return data;
  if (!hasNextWeekMondayColumn(data)) return data;
  return {
    ...data,
    hasNextWeekMonday: true,
    hasNextWeek: true,
  };
}
