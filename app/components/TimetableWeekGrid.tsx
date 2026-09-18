"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getKbpPairTime } from "@/lib/client/kbpBellSchedule";
import {
  getLiveCalendarDayIndex,
  getTimetableDayShortLabels,
  getWeekGridDisplayDay,
  hasNextWeekMondayColumn,
  TIMETABLE_SLOT_NEXT_MONDAY,
} from "@/lib/client/timetableDisplay";
import {
  formatTimetableDayDate,
  getWeekDateRangeLabel,
  parseTimetableWeekDates,
} from "@/lib/client/timetableWeekDates";
import TimetableEntityLink from "@/app/components/TimetableEntityLink";
import TimetableGradeBadges from "@/app/components/TimetableGradeBadges";
import {
  clampColFr,
  defaultColFr,
  readTimetablePcColWidths,
  TIMETABLE_PC_HDR_H,
  TIMETABLE_PC_ROW_H,
  TIMETABLE_PC_WEEK_COLS,
  writeTimetablePcColWidths,
} from "@/lib/client/timetablePcScale";
import {
  marksForSubjectOnDate,
  toIsoLocal,
  type TimetableJournalData,
} from "@/lib/client/timetableJournalMarks";
import { dayHasReplacements } from "@/lib/client/timetableDayReplacements";
import { resolveDayPairs, type MergedPair } from "@/lib/client/timetableMergeRows";

type Pair = MergedPair;

type TimetableWeekGridProps = {
  timetable: any;
  title?: string;
  subtitle?: string;
  onNavigateEntity?: (type: "group" | "teacher" | "place" | "subject", id: string, name: string) => void;
  hideTeacherRoom?: boolean;
  showGroup?: boolean;
  showTeacher?: boolean;
  showRoom?: boolean;
  showReplacementsDays: boolean[];
  onShowReplacementsDayChange?: (dayIndex: number, checked: boolean) => void;
  weekPage?: number;
  onWeekPageChange?: (page: number) => void;
  hideChrome?: boolean;
  searchParams?: URLSearchParams;
  showGrades?: boolean;
  journalData?: TimetableJournalData | null;
};

const WEEK_COLUMNS = TIMETABLE_PC_WEEK_COLS;
const DEFAULT_PAIR_ROWS = 7;

function formatBellClock(t: string): string {
  const raw = (t || "").trim();
  if (!raw) return "";
  const [hRaw, mRaw = "0"] = raw.split(/[.:]/).map((x) => x.trim());
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return raw;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function timeToMinutes(t: string): number | null {
  const s = (t || "").trim();
  if (!s) return null;
  const parts = s.split(/[.:]/).map((x) => x.trim());
  const h = Number(parts[0]);
  const m = Number(parts[1] || "0");
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function bellDayIndex(dayIndex: number) {
  return dayIndex === TIMETABLE_SLOT_NEXT_MONDAY ? 0 : dayIndex;
}

function getStatusColor(status: string, isNow = false) {
  const base = "border-[var(--tt-pc-line)] bg-[var(--tt-pc-cell)]";
  if (isNow) {
    return `${base} !bg-orange-50 ring-1 ring-orange-400/35 dark:!bg-orange-500/12 dark:ring-orange-500/30`;
  }
  switch (status) {
    case "added":
    case "replaced":
      // Замены — зелёные, как .added на kbp.by
      return `${base} !bg-green-50/90 dark:!bg-green-900/20`;
    case "removed":
    case "cancelled":
      return `${base} !bg-red-50/90 dark:!bg-red-900/20`;
    case "empty":
      return base;
    default:
      return base;
  }
}

function getPairsForDay(timetable: any, dayIndex: number, showReplacements: boolean): Pair[] {
  return resolveDayPairs(timetable.pairs || [], dayIndex, showReplacements);
}

function pairAtNumber(pairs: Pair[], pairNumber: number): Pair | null {
  return pairs.find((p) => p.pairNumber === pairNumber) ?? null;
}

function getNowHighlightedPairNumber(displayDay: number, pairs: Pair[], nowMinutes: number): number | null {
  if (displayDay === TIMETABLE_SLOT_NEXT_MONDAY) return null;
  const today = new Date().getDay();
  const currentDayIndex = getLiveCalendarDayIndex();
  if (currentDayIndex < 0 || displayDay !== currentDayIndex || pairs.length === 0) return null;

  for (const p of pairs) {
    const { start, end } = getKbpPairTime(p.pairNumber, bellDayIndex(displayDay));
    const s = timeToMinutes(start);
    const e = timeToMinutes(end);
    if (s === null || e === null) continue;
    if (nowMinutes >= s && nowMinutes < e) return p.pairNumber;
  }
  return null;
}

function WeekGridCellContent({
  pair,
  pairNumber,
  displayDay,
  hideTeacherRoom,
  showGroup = true,
  showTeacher = true,
  showRoom = true,
  gradeMarks,
}: {
  pair: Pair;
  pairNumber: number;
  displayDay: number;
  hideTeacherRoom: boolean;
  showGroup?: boolean;
  showTeacher?: boolean;
  showRoom?: boolean;
  gradeMarks: ReturnType<typeof marksForSubjectOnDate>;
}) {
  const pairTime = getKbpPairTime(pairNumber, bellDayIndex(displayDay));
  const timeRange =
    pairTime.start && pairTime.end
      ? `${formatBellClock(pairTime.start)}–${formatBellClock(pairTime.end)}`
      : "";

  const showTeacherEff = showTeacher && !hideTeacherRoom;
  const showRoomEff = showRoom && !hideTeacherRoom;
  const showGroupEff = showGroup;

  const lines =
    pair.lines?.length > 0
      ? pair.lines
      : [
          {
            group: pair.group ? { label: pair.group, id: pair.refs?.group?.id } : undefined,
            teacher: pair.teacher
              ? { label: pair.teacher, id: pair.refs?.teachers?.[0]?.id }
              : undefined,
            room: pair.room ? { label: pair.room, id: pair.refs?.place?.id } : undefined,
          },
        ];
  const showGroupDash = showGroupEff && lines.some((l) => l.group);

  return (
    <div className="grid min-h-full grid-cols-2 gap-x-2 gap-y-1.5" data-tt-cell-inner>
      <div className="flex min-w-0 items-start justify-start">
        {timeRange ? (
          <span className="truncate text-[12px] font-medium leading-tight text-gray-500 dark:text-zinc-400">
            {timeRange}
          </span>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col items-end justify-start gap-1">
        {showGroupEff
          ? lines.map((line, li) =>
              line.group ? (
                <TimetableEntityLink
                  key={`g-${li}-${line.group.label}`}
                  variant="pill"
                  label={line.group.label}
                  entity={{ type: "group", id: line.group.id }}
                />
              ) : showGroupDash ? (
                <span key={`g-dash-${li}`} className="text-[11px] text-gray-400 dark:text-zinc-500" aria-hidden>
                  —
                </span>
              ) : null
            )
          : null}
        {gradeMarks.length ? <TimetableGradeBadges marks={gradeMarks} /> : null}
      </div>

      <div className="flex min-w-0 flex-col items-start justify-end gap-0.5">
        <div className="w-full min-w-0 overflow-hidden text-[13px] font-semibold leading-tight text-gray-900 dark:text-zinc-50">
          {pair.subject ? (
            <TimetableEntityLink
              label={pair.subject}
              className="font-semibold text-gray-900 dark:text-zinc-50"
              entity={{ type: "subject", id: pair.refs?.subject?.id }}
            />
          ) : null}
        </div>
        {showTeacherEff
          ? lines.map((line, li) =>
              line.teacher ? (
                <div
                  key={`t-${li}-${line.teacher.label}`}
                  className="w-full min-w-0 overflow-hidden text-[11px] leading-tight text-gray-600 dark:text-zinc-400"
                >
                  <TimetableEntityLink
                    label={line.teacher.label}
                    className="text-[11px] text-gray-600 dark:text-zinc-400"
                    entity={{ type: "teacher", id: line.teacher.id }}
                  />
                </div>
              ) : (
                <div key={`t-empty-${li}`} className="h-[14px]" aria-hidden />
              )
            )
          : null}
      </div>

      <div className="flex min-w-0 flex-col items-end justify-end gap-0.5">
        {showRoomEff
          ? lines.map((line, li) =>
              line.room ? (
                <div
                  key={`r-${li}-${line.room.label}`}
                  className="w-full min-w-0 overflow-hidden text-right text-[11px] font-medium leading-tight text-gray-600 dark:text-zinc-400"
                >
                  <TimetableEntityLink
                    label={`ауд. ${line.room.label}`}
                    align="right"
                    className="text-[11px] font-medium text-gray-600 dark:text-zinc-400"
                    entity={{ type: "place", id: line.room.id }}
                  />
                </div>
              ) : (
                <div key={`r-empty-${li}`} className="h-[14px]" aria-hidden />
              )
            )
          : null}
      </div>
    </div>
  );
}

function WeekGridCell({
  pair,
  pairNumber,
  displayDay,
  isNow,
  hideTeacherRoom,
  showGroup,
  showTeacher,
  showRoom,
  rowHeightPx,
  gradeMarks,
}: {
  pair: Pair;
  pairNumber: number;
  displayDay: number;
  isNow: boolean;
  hideTeacherRoom: boolean;
  showGroup?: boolean;
  showTeacher?: boolean;
  showRoom?: boolean;
  rowHeightPx: number;
  gradeMarks: ReturnType<typeof marksForSubjectOnDate>;
}) {
  return (
    <div
      className={`w-full min-w-0 overflow-visible border p-2 ${getStatusColor(pair.status, isNow)}`}
      style={{ minHeight: rowHeightPx }}
      data-tt-cell="filled"
    >
      <WeekGridCellContent
        pair={pair}
        pairNumber={pairNumber}
        displayDay={displayDay}
        hideTeacherRoom={hideTeacherRoom}
        showGroup={showGroup}
        showTeacher={showTeacher}
        showRoom={showRoom}
        gradeMarks={gradeMarks}
      />
    </div>
  );
}

export default function TimetableWeekGrid({
  timetable,
  title,
  subtitle,
  hideTeacherRoom = false,
  showGroup = true,
  showTeacher = true,
  showRoom = true,
  showReplacementsDays,
  onShowReplacementsDayChange,
  weekPage: weekPageProp,
  onWeekPageChange,
  hideChrome = false,
  showGrades = false,
  journalData = null,
}: TimetableWeekGridProps) {
  const currentDayIndex = getLiveCalendarDayIndex();
  const canShowNextWeek = hasNextWeekMondayColumn(timetable);
  const [weekPageInternal, setWeekPageInternal] = useState(0);
  const weekPage = weekPageProp ?? weekPageInternal;
  const setWeekPage = onWeekPageChange ?? setWeekPageInternal;
  const [nowMinutes, setNowMinutes] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });
  const [colFr, setColFr] = useState<number[]>(() => defaultColFr());
  const gridWrapRef = useRef<HTMLDivElement>(null);
  const widthsReadyRef = useRef(false);
  const resizeRef = useRef<{ col: number; startX: number; startFr: number } | null>(null);

  const rowHeightPx = TIMETABLE_PC_ROW_H;
  const headerHeightPx = TIMETABLE_PC_HDR_H;

  useEffect(() => {
    const stored = readTimetablePcColWidths();
    if (stored) setColFr(stored);
    widthsReadyRef.current = true;
  }, []);

  const startColResize = useCallback(
    (col: number, clientX: number) => {
      resizeRef.current = { col, startX: clientX, startFr: colFr[col] };
    },
    [colFr]
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const r = resizeRef.current;
      const wrap = gridWrapRef.current;
      if (!r || !wrap) return;
      const trackW = Math.max(1, wrap.clientWidth - 32);
      setColFr((prev) => {
        const totalFr = prev.reduce((a, b) => a + b, 0);
        const pxPerFr = trackW / totalFr;
        const deltaFr = (e.clientX - r.startX) / pxPerFr;
        const copy = [...prev];
        copy[r.col] = clampColFr(r.startFr + deltaFr);
        if (widthsReadyRef.current) writeTimetablePcColWidths(copy);
        return copy;
      });
    };
    const onUp = () => {
      resizeRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNowMinutes(d.getHours() * 60 + d.getMinutes());
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  const dayShortLabels = useMemo(() => getTimetableDayShortLabels(timetable).slice(0, WEEK_COLUMNS), [timetable]);
  const weekRangeLabel = getWeekDateRangeLabel(timetable, weekPage);
  const weekDates = useMemo(() => parseTimetableWeekDates(weekRangeLabel), [weekRangeLabel]);

  const columnDisplayDays = useMemo(
    () => Array.from({ length: WEEK_COLUMNS }, (_, col) => getWeekGridDisplayDay(weekPage, col)),
    [weekPage]
  );

  const pairsByColumn = useMemo(
    () =>
      columnDisplayDays.map((displayDay) => {
        if (displayDay === null) return [] as Pair[];
        return getPairsForDay(timetable, displayDay, showReplacementsDays[displayDay] ?? true);
      }),
    [columnDisplayDays, timetable, showReplacementsDays]
  );

  const pairRows = useMemo(() => {
    let max = DEFAULT_PAIR_ROWS;
    for (const pairs of pairsByColumn) {
      for (const p of pairs) {
        if (p.pairNumber > max) max = p.pairNumber;
      }
    }
    return Array.from({ length: max }, (_, i) => i + 1);
  }, [pairsByColumn]);

  const nowPairByColumn = useMemo(
    () =>
      weekPage === 0
        ? pairsByColumn.map((pairs, col) => {
            const displayDay = columnDisplayDays[col];
            if (displayDay === null) return null;
            return getNowHighlightedPairNumber(displayDay, pairs, nowMinutes);
          })
        : Array(WEEK_COLUMNS).fill(null),
    [weekPage, pairsByColumn, columnDisplayDays, nowMinutes]
  );

  const gridTemplateColumns = `2rem ${colFr.map((w) => `${w}fr`).join(" ")}`;

  const goPrevWeek = () => setWeekPage(0);
  const goNextWeek = () => {
    if (canShowNextWeek) setWeekPage(1);
  };

  return (
    <div className="flex flex-col pb-8">
      {!hideChrome && (title || subtitle) && (
        <div className="mb-3 border-b border-[var(--tt-pc-border)] pb-3">
          {title ? <h2 className="text-lg font-bold text-gray-900 dark:text-zinc-100">{title}</h2> : null}
          {subtitle ? <p className="text-sm text-gray-500 dark:text-zinc-400">{subtitle}</p> : null}
        </div>
      )}

      {!hideChrome ? (
      <div className="mb-3 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={goPrevWeek}
          disabled={weekPage <= 0}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-none border-0 bg-transparent text-lg text-gray-700 hover:text-gray-900 disabled:opacity-30 dark:text-zinc-200 dark:hover:text-zinc-50"
          aria-label="Текущая неделя"
        >
          ‹
        </button>
        <div className="min-w-0 text-center">
          <div className="truncate text-sm font-semibold text-gray-800 dark:text-zinc-100">
            {weekRangeLabel || (weekPage === 0 ? "Текущая неделя" : "Следующая неделя")}
          </div>
          <div className="text-[11px] text-gray-500 dark:text-zinc-400">
            {weekPage === 0 ? "Текущая неделя" : "Следующая неделя"}
          </div>
        </div>
        <button
          type="button"
          onClick={goNextWeek}
          disabled={!canShowNextWeek || weekPage >= 1}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-none border-0 bg-transparent text-lg text-gray-700 hover:text-gray-900 disabled:opacity-30 dark:text-zinc-200 dark:hover:text-zinc-50"
          aria-label="Следующая неделя"
        >
          ›
        </button>
      </div>
      ) : null}

      <div
        ref={gridWrapRef}
        className="timetable-pc-wrap relative w-full overflow-x-hidden rounded-[2px] border border-[var(--tt-pc-border)] bg-[var(--tt-pc-bg)]"
      >
        <div
          className="timetable-pc-grid grid w-full gap-0 bg-[var(--tt-pc-line)]"
          style={{
            gridTemplateColumns,
          }}
        >
          <div className="bg-[var(--tt-pc-surface)]" style={{ height: headerHeightPx }} aria-hidden="true" />

          {dayShortLabels.map((label, col) => {
            const displayDay = columnDisplayDays[col];
            const isToday = weekPage === 0 && currentDayIndex >= 0 && col === currentDayIndex && displayDay !== null;
            const dateLabel = weekDates[col] ? formatTimetableDayDate(weekDates[col]) : "";
            const hasRepl = displayDay !== null && dayHasReplacements(timetable, displayDay);
            const showRepl = displayDay !== null ? showReplacementsDays[displayDay] ?? true : true;
            return (
              <div
                key={`hdr-${col}`}
                className={`relative flex flex-col items-center justify-center border border-[var(--tt-pc-line)] px-1 text-center leading-tight ${
                  isToday
                    ? "bg-[var(--tt-pc-today-bg)] text-[var(--tt-pc-today-text)]"
                    : "bg-[var(--tt-pc-surface)] text-gray-800 dark:text-zinc-100"
                }`}
                style={{ height: headerHeightPx }}
              >
                {dateLabel ? (
                  <div className="text-sm font-bold">{dateLabel}</div>
                ) : (
                  <div className="text-sm font-bold text-gray-400">—</div>
                )}
                <div className="mt-0.5 text-xs font-medium">{label}</div>
                {hasRepl && onShowReplacementsDayChange && displayDay !== null ? (
                  <label
                    className="mt-0.5 inline-flex max-w-full cursor-pointer items-center justify-center gap-0.5 text-[9px] font-medium text-gray-600 dark:text-zinc-300"
                    title="Показать замены"
                  >
                    <input
                      type="checkbox"
                      className="h-3 w-3 shrink-0 rounded border-gray-300 text-[var(--app-accent)]"
                      checked={showRepl}
                      onChange={(e) => onShowReplacementsDayChange(displayDay, e.target.checked)}
                    />
                    <span className="truncate">Замены</span>
                  </label>
                ) : null}
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Изменить ширину столбца"
                  className="absolute -right-px top-0 z-10 h-full w-2 cursor-col-resize touch-none"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    startColResize(col, e.clientX);
                  }}
                />
              </div>
            );
          })}

          {pairRows.map((pairNumber) => (
            <Fragment key={`row-${pairNumber}`}>
              <div
                className="flex items-center justify-center border border-[var(--tt-pc-line)] bg-[var(--tt-pc-surface)] text-sm font-bold text-gray-600 dark:text-zinc-300"
                style={{ height: rowHeightPx }}
              >
                {pairNumber}
              </div>

              {pairsByColumn.map((pairs, col) => {
                const displayDay = columnDisplayDays[col];
                const pair = pairAtNumber(pairs, pairNumber);
                const isEmpty = !pair || !pair.subject?.trim();
                const isNow = nowPairByColumn[col] === pairNumber;

                if (displayDay === null) {
                  return (
                    <div
                      key={`cell-${col}-${pairNumber}`}
                      className="w-full border border-[var(--tt-pc-line)] bg-[var(--tt-pc-bg)]"
                      style={{ height: rowHeightPx }}
                    />
                  );
                }

                if (isEmpty) {
                  return (
                    <div
                      key={`cell-${col}-${pairNumber}`}
                      className="w-full border border-[var(--tt-pc-line)] bg-[var(--tt-pc-cell)]"
                      style={{ height: rowHeightPx }}
                    />
                  );
                }

                return (
                  <WeekGridCell
                    key={`cell-${col}-${pairNumber}`}
                    pair={pair}
                    pairNumber={pairNumber}
                    displayDay={displayDay}
                    isNow={isNow}
                    hideTeacherRoom={hideTeacherRoom}
                    showGroup={showGroup}
                    showTeacher={showTeacher}
                    showRoom={showRoom}
                    rowHeightPx={rowHeightPx}
                    gradeMarks={
                      showGrades
                        ? marksForSubjectOnDate(
                            journalData,
                            pair.subject || pair.refs?.subject?.name || "",
                            weekDates[col] ? toIsoLocal(weekDates[col]) : ""
                          )
                        : []
                    }
                  />
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
