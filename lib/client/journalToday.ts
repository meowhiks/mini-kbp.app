import { isoToday } from "@/lib/client/teacherJournalGrid";

/** Индекс последней колонки с сегодняшней датой (красная полоска справа). */
export function findLastTodayColumnIndex(dateKeys: string[]): number | null {
  const today = isoToday();
  for (let i = dateKeys.length - 1; i >= 0; i--) {
    if (dateKeys[i] === today) return i;
  }
  return null;
}

export function todayBorderRight(idx: number, todayIndex: number | null): string {
  return todayIndex !== null && idx === todayIndex ? "journal-today-after" : "";
}
