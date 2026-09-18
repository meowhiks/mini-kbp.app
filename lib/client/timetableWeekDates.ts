const RU_MONTHS: Record<string, number> = {
  января: 0,
  февраля: 1,
  марта: 2,
  апреля: 3,
  мая: 4,
  июня: 5,
  июля: 6,
  августа: 7,
  сентября: 8,
  октября: 9,
  ноября: 10,
  декабря: 11,
};

function inferYear(month: number, ref = new Date()): number {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  if (month === 0 && m === 11) return y + 1;
  if (month === 11 && m === 0) return y - 1;
  return y;
}

/** Парсит «15 — 20 декабря» или «30 декабря — 4 января» в 6 дат (Пн–Сб). */
export function parseTimetableWeekDates(dateRange: string, refDate = new Date()): Date[] {
  const s = dateRange
    .replace(/&mdash;/gi, "—")
    .replace(/\u2013|\u2014/g, "—")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return [];

  const crossMonth = s.match(/^(\d{1,2})\s+([а-яё]+)\s*—\s*(\d{1,2})\s+([а-яё]+)(?:\s+(\d{4}))?$/iu);
  if (crossMonth) {
    const d1 = Number.parseInt(crossMonth[1], 10);
    const mon1 = RU_MONTHS[crossMonth[2].toLowerCase()];
    if (mon1 === undefined) return [];
    const year = crossMonth[5] ? Number.parseInt(crossMonth[5], 10) : inferYear(mon1, refDate);
    const start = new Date(year, mon1, d1);
    const dates: Date[] = [start];
    while (dates.length < 6) {
      const prev = dates[dates.length - 1];
      const next = new Date(prev);
      next.setDate(next.getDate() + 1);
      dates.push(next);
    }
    return dates;
  }

  const sameMonth = s.match(/^(\d{1,2})\s*—\s*(\d{1,2})\s+([а-яё]+)(?:\s+(\d{4}))?$/iu);
  if (sameMonth) {
    const d1 = Number.parseInt(sameMonth[1], 10);
    const mon = RU_MONTHS[sameMonth[3].toLowerCase()];
    if (mon === undefined) return [];
    const year = sameMonth[4] ? Number.parseInt(sameMonth[4], 10) : inferYear(mon, refDate);
    const dates: Date[] = [];
    for (let d = d1; dates.length < 6; d++) {
      dates.push(new Date(year, mon, d));
    }
    return dates;
  }

  return [];
}

export function formatTimetableDayDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}`;
}

export function formatWeekRangeLabel(label: string): string {
  return label
    .replace(/&mdash;/gi, "—")
    .replace(/\u2013|\u2014/g, "—")
    .replace(/\s+/g, " ")
    .trim();
}

export function getWeekDateRangeLabel(
  data: { currentWeek?: { dateRange?: string }; nextWeekMonday?: { dateRange?: string } } | null | undefined,
  weekPage: number
): string {
  if (!data) return "";
  const raw = weekPage === 0 ? data.currentWeek?.dateRange ?? "" : data.nextWeekMonday?.dateRange ?? "";
  return formatWeekRangeLabel(raw);
}
