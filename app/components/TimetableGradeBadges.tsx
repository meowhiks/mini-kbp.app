"use client";

import type { TimetableGradeMark } from "@/lib/client/timetableJournalMarks";

/** Плашка оценки в карточке пары — по умолчанию без фона. */
export default function TimetableGradeBadges({ marks }: { marks: TimetableGradeMark[] }) {
  if (!marks.length) return null;
  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-1">
      {marks.map((m, i) => (
        <span
          key={`${m.value}-${i}`}
          className={`inline-flex max-w-full items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums ${m.textClass}`}
          style={m.backgroundColor ? { backgroundColor: m.backgroundColor } : undefined}
          title={m.value}
        >
          {m.display}
        </span>
      ))}
    </span>
  );
}
