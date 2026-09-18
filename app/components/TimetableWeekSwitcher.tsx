"use client";

import { getWeekDateRangeLabel } from "@/lib/client/timetableWeekDates";
import { hasNextWeekMondayColumn, normalizeTimetableData } from "@/lib/client/timetableDisplay";

type TimetableWeekSwitcherProps = {
  timetable: unknown;
  weekPage: number;
  onWeekPageChange: (page: number) => void;
};

export default function TimetableWeekSwitcher({
  timetable,
  weekPage,
  onWeekPageChange,
}: TimetableWeekSwitcherProps) {
  const data = normalizeTimetableData(timetable);
  const canShowNextWeek = hasNextWeekMondayColumn(data);
  const weekRangeLabel = getWeekDateRangeLabel(data, weekPage);

  const goPrevWeek = () => onWeekPageChange(0);
  const goNextWeek = () => {
    if (canShowNextWeek) onWeekPageChange(1);
  };

  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={goPrevWeek}
        disabled={weekPage <= 0}
        className="flex h-9 w-8 shrink-0 items-center justify-center rounded-none border-0 bg-transparent text-lg text-gray-700 hover:text-gray-900 disabled:opacity-30 dark:text-zinc-100 dark:hover:text-white"
        aria-label="Текущая неделя"
      >
        ‹
      </button>
      <div className="min-w-[7rem] max-w-[10rem] text-center">
        <div className="truncate text-sm font-semibold text-gray-800 dark:text-zinc-100">
          {weekRangeLabel || (weekPage === 0 ? "Текущая неделя" : "Следующая неделя")}
        </div>
        <div className="truncate text-[11px] text-gray-500 dark:text-zinc-400">
          {weekPage === 0 ? "Текущая неделя" : "Следующая неделя"}
        </div>
      </div>
      <button
        type="button"
        onClick={goNextWeek}
        disabled={!canShowNextWeek || weekPage >= 1}
        className="flex h-9 w-8 shrink-0 items-center justify-center rounded-none border-0 bg-transparent text-lg text-gray-700 hover:text-gray-900 disabled:opacity-30 dark:text-zinc-100 dark:hover:text-white"
        aria-label="Следующая неделя"
      >
        ›
      </button>
    </div>
  );
}
