"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import TimetableEntityLink from "@/app/components/TimetableEntityLink";
import TimetableGradeBadges from "@/app/components/TimetableGradeBadges";
import TimetableWeekGrid from "@/app/components/TimetableWeekGrid";
import { getKbpPairTime } from "@/lib/client/kbpBellSchedule";
import { subscribePcTimetableView } from "@/lib/client/platform";
import { dayHasReplacements } from "@/lib/client/timetableDayReplacements";
import {
  getLiveCalendarDayIndex,
  getTimetableDayCount,
  getTimetableDayLabels,
  getTimetableDayShortLabels,
  normalizeTimetableData,
  pairMatchesDisplayDay,
  TIMETABLE_SLOT_NEXT_MONDAY,
} from "@/lib/client/timetableDisplay";
import {
  isoDateForTimetableDay,
  marksForSubjectOnDate,
  toIsoLocal,
  type TimetableJournalData,
} from "@/lib/client/timetableJournalMarks";
import { getWeekDateRangeLabel, parseTimetableWeekDates } from "@/lib/client/timetableWeekDates";
import { resolveDayPairs, type MergedPair } from "@/lib/client/timetableMergeRows";

type Pair = MergedPair;

interface TimetableViewProps {
  data: any;
  title?: string;
  subtitle?: string;
  onNavigateEntity?: (type: "group" | "teacher" | "place" | "subject", id: string, name: string) => void;
  countdownEnabled?: boolean;
  defaultShowReplacements?: boolean;
  density?: "normal" | "compact" | "small";
  /** Не показывать блок преподаватель / аудитория */
  hideTeacherRoom?: boolean;
  /** Не показывать номер пары слева */
  hidePairNumbers?: boolean;
  /** Показывать подгруппу / группу в карточке пары */
  showGroup?: boolean;
  /** Показывать преподавателя */
  showTeacher?: boolean;
  /** Показывать аудиторию */
  showRoom?: boolean;
  /** Полоска быстрого выбора дня (Пн–Сб, след. понедельник) */
  showDayStrip?: boolean;
  weekPage?: number;
  onWeekPageChange?: (page: number) => void;
  hidePcChrome?: boolean;
  searchParams?: URLSearchParams;
  showGrades?: boolean;
  journalData?: TimetableJournalData | null;
}

export default function TimetableView({
  data,
  title,
  subtitle,
  countdownEnabled,
  defaultShowReplacements,
  density,
  hideTeacherRoom = false,
  hidePairNumbers = false,
  showGroup = true,
  showTeacher = true,
  showRoom = true,
  showDayStrip = false,
  weekPage,
  onWeekPageChange,
  hidePcChrome = false,
  showGrades = false,
  journalData = null,
}: TimetableViewProps) {
  const defaultReplacement = defaultShowReplacements ?? true;
  const densityMode: "normal" | "compact" | "small" = density ?? "normal";

  const [showReplacementsDays, setShowReplacementsDays] = useState<boolean[]>(() =>
    Array(7).fill(defaultReplacement)
  );
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const currentDayIndex = getLiveCalendarDayIndex();
  const initialDayIndex = currentDayIndex >= 0 && currentDayIndex <= 5 ? currentDayIndex : 0;
  const [visibleDayIndex, setVisibleDayIndex] = useState(initialDayIndex);
  const dayStripRef = useRef<HTMLDivElement>(null);
  const [dayAnim, setDayAnim] = useState<"" | "timetable-day-in-r" | "timetable-day-in-l">("");
  const prevDayRef = useRef(visibleDayIndex);

  const [nowTickMs, setNowTickMs] = useState<number>(() => Date.now());
  const [isPcGrid, setIsPcGrid] = useState(false);
  useEffect(() => subscribePcTimetableView(setIsPcGrid), []);
  useEffect(() => {
    if (!countdownEnabled) return;
    const id = window.setInterval(() => setNowTickMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [countdownEnabled]);

  useEffect(() => {
    setVisibleDayIndex(initialDayIndex);
  }, [initialDayIndex]);

  const timetable = useMemo(() => normalizeTimetableData(data), [data]);
  const hasData = Boolean(timetable?.pairs?.length);
  const weekDays = useMemo(() => (hasData ? getTimetableDayLabels(timetable) : []), [timetable, hasData]);
  const dayShortLabels = useMemo(() => (hasData ? getTimetableDayShortLabels(timetable) : []), [timetable, hasData]);
  const weekDates = useMemo(() => {
    if (!hasData) return [] as Date[];
    return parseTimetableWeekDates(getWeekDateRangeLabel(timetable, weekPage ?? 0));
  }, [timetable, hasData, weekPage]);
  const dayCount = hasData ? getTimetableDayCount(timetable) : 6;
  const maxDayIndex = dayCount - 1;

  useEffect(() => {
    setVisibleDayIndex((prev) => Math.min(prev, maxDayIndex));
  }, [maxDayIndex, hasData]);

  useEffect(() => {
    if (weekPage === 1 && maxDayIndex >= TIMETABLE_SLOT_NEXT_MONDAY) {
      setVisibleDayIndex(TIMETABLE_SLOT_NEXT_MONDAY);
    } else if (weekPage === 0) {
      setVisibleDayIndex((prev) => Math.min(prev, Math.min(5, maxDayIndex)));
    }
  }, [weekPage, maxDayIndex]);

  useEffect(() => {
    if (!showDayStrip || !dayStripRef.current) return;
    const chip = dayStripRef.current.children[visibleDayIndex] as HTMLElement | undefined;
    chip?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [visibleDayIndex, showDayStrip, dayShortLabels.length]);

  useEffect(() => {
    if (prevDayRef.current === visibleDayIndex) return;
    setDayAnim(visibleDayIndex > prevDayRef.current ? "timetable-day-in-r" : "timetable-day-in-l");
    prevDayRef.current = visibleDayIndex;
    const id = window.setTimeout(() => setDayAnim(""), 340);
    return () => window.clearTimeout(id);
  }, [visibleDayIndex]);

  // Set replacement toggle defaults based on parsed "замены" row / overlay.
  useEffect(() => {
    const statuses = timetable?.dayReplacementStatus;
    const len = Math.max(7, Array.isArray(statuses) ? statuses.length : 7);

    setShowReplacementsDays((prev) =>
      Array.from({ length: len }, (_, idx) => {
        if (dayHasReplacements(timetable, idx)) return defaultReplacement;
        const info = Array.isArray(statuses) ? statuses[idx] : null;
        if (info?.noChanges) return false;
        return prev[idx] ?? defaultReplacement;
      })
    );
  }, [timetable, defaultReplacement]);

  const goPrevDay = () => setVisibleDayIndex((prev) => Math.max(0, prev - 1));
  const goNextDay = () => setVisibleDayIndex((prev) => Math.min(maxDayIndex, prev + 1));

  if (!hasData) {
    return (
      <div className="flex min-h-[calc(100dvh-10rem)] flex-col pb-20">
        <div className="py-12 text-center text-gray-500 dark:text-zinc-400">
          <p className="text-base font-medium text-gray-800 dark:text-zinc-200">Расписание не видно</p>
          <p className="mt-2 text-sm">
            На этой неделе нет пар или данные не загрузились. Выберите другую группу в поиске.
          </p>
        </div>
        <div className="flex-1" aria-hidden="true" />
      </div>
    );
  }

  const visibleDayName = weekDays[visibleDayIndex] ?? weekDays[0];
  const visibleIsToday = visibleDayIndex === currentDayIndex;

  const dayHeaderPadding =
    densityMode === "small" ? "px-2 py-2" : densityMode === "compact" ? "px-3 py-2" : "px-4 py-3";
  const pairPadding = densityMode === "small" ? "p-2" : densityMode === "compact" ? "p-3" : "p-4";
  const pairNumberClass =
    densityMode === "small" ? "text-base w-5" : densityMode === "compact" ? "text-lg w-6" : "text-lg w-6";

  const formatBellClock = (t: string): string => {
    const raw = (t || "").trim();
    if (!raw) return "";
    const [hRaw, mRaw = "0"] = raw.split(/[.:]/).map((x) => x.trim());
    const h = Number(hRaw);
    const m = Number(mRaw);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return raw;
    return `${h}:${String(m).padStart(2, "0")}`;
  };

  const timeToMinutes = (t: string): number | null => {
    const s = (t || "").trim();
    if (!s) return null;
    const parts = s.split(/[.:]/).map((x) => x.trim());
    const h = Number(parts[0]);
    const m = Number(parts[1] || "0");
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  };

  const nowMinutes = (() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  })();

  const isLiveCalendarDay = (dayIndex: number) => dayIndex === currentDayIndex;

  const bellDayIndex = (dayIndex: number) => (dayIndex === TIMETABLE_SLOT_NEXT_MONDAY ? 0 : dayIndex);

  const getNowHighlightedPairNumber = (dayIndex: number, pairs: Pair[]): number | null => {
    if (!isLiveCalendarDay(dayIndex)) return null;
    if (pairs.length === 0) return null;

    // 1) exact current pair
    for (const p of pairs) {
      const { start, end } = getKbpPairTime(p.pairNumber, bellDayIndex(dayIndex));
      const s = timeToMinutes(start);
      const e = timeToMinutes(end);
      if (s === null || e === null) continue;
      if (nowMinutes >= s && nowMinutes < e) return p.pairNumber;
    }

    return null;
  };

  const formatCountdown = (ms: number) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const mm = String(m).padStart(2, "0");
    const ss = String(s).padStart(2, "0");
    if (h > 0) return `${h}:${mm}:${ss}`;
    return `${m}:${ss}`;
  };

  const getCountdownParen = (pairNumber: number, dayIndex: number): string | null => {
    if (!countdownEnabled || !isLiveCalendarDay(dayIndex)) return null;
    const { start, end } = getKbpPairTime(pairNumber, bellDayIndex(dayIndex));
    const sMin = timeToMinutes(start);
    const eMin = timeToMinutes(end);
    if (sMin === null || eMin === null) return null;

    const now = nowTickMs;
    const base = new Date();

    const sDate = new Date(base);
    sDate.setHours(Math.floor(sMin / 60), sMin % 60, 0, 0);
    const eDate = new Date(base);
    eDate.setHours(Math.floor(eMin / 60), eMin % 60, 0, 0);

    if (now < sDate.getTime()) return formatCountdown(sDate.getTime() - now);
    if (now < eDate.getTime()) return formatCountdown(eDate.getTime() - now);
    return null;
  };

  const getNextHighlightedPairNumber = (dayIndex: number, pairs: Pair[]): number | null => {
    if (!isLiveCalendarDay(dayIndex)) return null;
    if (pairs.length === 0) return null;

    // nearest upcoming pair
    let best: { pairNumber: number; start: number } | null = null;
    for (const p of pairs) {
      const { start } = getKbpPairTime(p.pairNumber, bellDayIndex(dayIndex));
      const s = timeToMinutes(start);
      if (s === null) continue;
      if (s > nowMinutes && (!best || s < best.start)) best = { pairNumber: p.pairNumber, start: s };
    }
    return best?.pairNumber ?? null;
  };

  const getPairsForDay = (dayIndex: number): Pair[] => {
    return resolveDayPairs(timetable.pairs || [], dayIndex, showReplacementsDays[dayIndex]);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "added":
      case "replaced":
        // Замены — зелёные, как .added на kbp.by
        return "bg-green-50 border-green-300 dark:bg-green-900/35 dark:border-green-700/60";
      case "removed":
      case "cancelled":
        return "bg-red-50 border-red-300 dark:bg-red-900/35 dark:border-red-700/60";
      case "empty":
        return "bg-white border-gray-200 dark:bg-[var(--app-surface)] dark:border-[var(--app-border)]";
      default:
        return "bg-white border-gray-200 dark:bg-[var(--app-surface)] dark:border-[var(--app-border)]";
    }
  };

  const showGroupEff = showGroup;
  const showTeacherEff = showTeacher && !hideTeacherRoom;
  const showRoomEff = showRoom && !hideTeacherRoom;
  const showPairMeta = showGroupEff || showTeacherEff || showRoomEff;

  if (isPcGrid) {
    return (
      <TimetableWeekGrid
        timetable={timetable}
        title={title}
        subtitle={subtitle}
        hideTeacherRoom={hideTeacherRoom}
        showGroup={showGroupEff}
        showTeacher={showTeacherEff}
        showRoom={showRoomEff}
        showReplacementsDays={showReplacementsDays}
        onShowReplacementsDayChange={(dayIndex, checked) =>
          setShowReplacementsDays((prev) => {
            const next = [...prev];
            next[dayIndex] = checked;
            return next;
          })
        }
        weekPage={weekPage}
        onWeekPageChange={onWeekPageChange}
        hideChrome={hidePcChrome}
        showGrades={showGrades}
        journalData={journalData}
      />
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-10rem)] min-w-0 flex-col overflow-x-hidden pb-20 overscroll-x-none">
      {/* Header */}
      {(title || subtitle) && (
        <div className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 py-3 dark:border-[var(--app-border)] dark:bg-[var(--app-bg)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              {title && <h2 className="text-lg font-bold text-gray-900 dark:text-zinc-100">{title}</h2>}
              {subtitle && <p className="text-sm text-gray-500 dark:text-zinc-400">{subtitle}</p>}
            </div>
            {!showDayStrip ? (
              <div className="text-right">
                <div className={`text-[11px] font-semibold ${visibleIsToday ? "text-[var(--app-accent)]" : "text-gray-700 dark:text-zinc-200"}`}>
                  {visibleDayName}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {showDayStrip ? (
      <div className="pt-2 pb-1 flex items-center gap-1">
        <button
          type="button"
          onClick={goPrevDay}
          disabled={visibleDayIndex <= 0}
          className="shrink-0 w-8 h-8 rounded-lg border border-gray-200 dark:border-[var(--app-border)] text-gray-700 dark:text-zinc-100 disabled:opacity-30"
          aria-label="Предыдущий день"
        >
          ‹
        </button>
        <div ref={dayStripRef} className="flex flex-1 gap-1 overflow-x-auto pb-0.5 app-scroll">
          {dayShortLabels.map((label, idx) => {
            const active = visibleDayIndex === idx;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => setVisibleDayIndex(idx)}
                className={`shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border ${
                  active
                    ? "bg-[var(--app-accent)] text-white border-[var(--app-accent)]"
                    : "bg-white text-gray-700 border-gray-200 dark:bg-[var(--app-elevated)] dark:text-zinc-100 dark:border-[var(--app-border)]"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={goNextDay}
          disabled={visibleDayIndex >= maxDayIndex}
          className="shrink-0 w-8 h-8 rounded-lg border border-gray-200 dark:border-[var(--app-border)] text-gray-700 dark:text-zinc-100 disabled:opacity-30"
          aria-label="Следующий день"
        >
          ›
        </button>
      </div>
      ) : null}

      {/* Single day view with horizontal swipe */}
      <div className="min-w-0 space-y-3 overflow-x-hidden px-1 pt-1 pb-1 overscroll-x-none">
        {(() => {
          const dayIndex = visibleDayIndex;
          const dayIso =
            dayIndex === TIMETABLE_SLOT_NEXT_MONDAY
              ? (() => {
                  const mon = weekDates[0];
                  if (!mon) return "";
                  const next = new Date(mon);
                  next.setDate(next.getDate() + 7);
                  return toIsoLocal(next);
                })()
              : isoDateForTimetableDay(weekDates, dayIndex) ?? "";
          const day = weekDays[dayIndex];
          const pairs = getPairsForDay(dayIndex);
          const showTodayChrome = dayIndex === currentDayIndex;
          const showReplacements = showReplacementsDays[dayIndex];
          const highlightedPairNumber = getNowHighlightedPairNumber(dayIndex, pairs);
          const nextHighlightedPairNumber = getNextHighlightedPairNumber(dayIndex, pairs);
          const replacementInfo = timetable?.dayReplacementStatus?.[dayIndex];
          const replacementLabel = replacementInfo?.label?.trim() || "";
          const dayHasRepl = dayHasReplacements(timetable, dayIndex);
          const dayRange = timetable?.dayStartTimes?.[dayIndex];
          const dayPairsForRange = (timetable?.pairs || [])
            .filter((p: Pair) => pairMatchesDisplayDay(p, dayIndex))
            .filter((p: Pair) => {
              const subjectTrimmed = (p.subject || "").trim();
              if (!subjectTrimmed || subjectTrimmed === "Урок снят") return false;
              if (p.status === "removed" || p.status === "cancelled") return false;
              return true;
            })
            .sort((a: Pair, b: Pair) => a.pairNumber - b.pairNumber);
          const fallbackStart = dayPairsForRange[0]
            ? getKbpPairTime(dayPairsForRange[0].pairNumber, bellDayIndex(dayIndex)).start
            : "";
          const fallbackEnd = dayPairsForRange[dayPairsForRange.length - 1]
            ? getKbpPairTime(dayPairsForRange[dayPairsForRange.length - 1].pairNumber, bellDayIndex(dayIndex)).end
            : "";
          const dayRangeText =
            dayRange?.start && dayRange?.end
              ? `${dayRange.start} - ${dayRange.end}`
              : fallbackStart && fallbackEnd
              ? `${fallbackStart} - ${fallbackEnd}`
              : "—";

          return (
            <div
              key={day}
              className={
                showTodayChrome
                  ? "rounded-xl ring-2 ring-[var(--app-accent-ring)]"
                  : "rounded-xl"
              }
            >
            <div
              className="timetable-mobile-card relative flex min-h-[calc(100dvh-14rem)] min-w-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-[var(--app-border)] dark:bg-[var(--app-surface)]"
              style={{ touchAction: "pan-y pinch-zoom", overscrollBehaviorX: "none" }}
              onTouchStart={(e) => {
                e.stopPropagation();
                const t = e.touches[0];
                if (!t) return;
                touchStartRef.current = { x: t.clientX, y: t.clientY };
              }}
              onTouchMove={(e) => {
                const start = touchStartRef.current;
                if (!start) return;
                const t = e.touches[0];
                if (!t) return;
                const dx = Math.abs(t.clientX - start.x);
                const dy = Math.abs(t.clientY - start.y);
                if (dx > dy && dx > 8) e.preventDefault();
              }}
              onTouchCancel={() => {
                touchStartRef.current = null;
              }}
              onTouchEnd={(e) => {
                e.stopPropagation();
                const start = touchStartRef.current;
                touchStartRef.current = null;
                if (!start) return;
                const t = e.changedTouches[0];
                if (!t) return;
                const dx = t.clientX - start.x;
                const dy = t.clientY - start.y;
                const threshold = Math.max(40, Math.round(window.innerWidth * 0.1));
                if (Math.abs(dx) < threshold) return;
                if (Math.abs(dy) > Math.abs(dx) * 0.75) return;
                if (dx < 0) goNextDay();
                else goPrevDay();
              }}
            >
              <div className={`${dayAnim} flex flex-1 flex-col`} style={{ willChange: "transform" }}>
              {/* Day Header */}
              <div className={`timetable-mobile-day-header rounded-t-xl ${dayHeaderPadding} font-semibold flex flex-wrap items-start justify-between gap-2 min-w-0 ${
                showTodayChrome
                  ? "bg-[var(--app-accent-soft)] text-[var(--app-accent)] dark:text-[var(--app-accent)]"
                  : "bg-gray-100 text-gray-800 dark:bg-[var(--app-elevated)] dark:text-zinc-100"
              }`}>
                <div className="min-w-0 flex-1">
                  {!showDayStrip ? <span className="break-words">{day}</span> : null}
                  {replacementLabel ? (
                  <div className="text-[11px] text-[var(--app-accent)]/80 font-medium">
                    {replacementLabel}
                  </div>
                  ) : null}
                  {dayHasRepl && (
                    <label className="inline-flex items-center gap-1 mt-1 text-[11px] text-gray-700 dark:text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showReplacements}
                        onChange={(e) =>
                          setShowReplacementsDays((prev) => {
                            const next = [...prev];
                            next[dayIndex] = e.target.checked;
                            return next;
                          })
                        }
                        className="w-3.5 h-3.5 text-[var(--app-accent)] border-gray-300 rounded"
                      />
                      <span>Показать замены</span>
                    </label>
                  )}
                </div>
                <div className="shrink-0 text-right max-w-[45%]">
                  <div className="text-[11px] font-semibold text-gray-700 dark:text-zinc-200 truncate">{dayRangeText}</div>
                  {showTodayChrome && (
                    <span className="inline-block max-w-full truncate text-[10px] sm:text-xs bg-[var(--app-accent-muted)] text-[var(--app-accent)] px-1.5 sm:px-2 py-0.5 rounded-full">
                      Сегодня
                    </span>
                  )}
                </div>
              </div>

              {/* Pairs */}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col divide-y divide-[var(--tt-pc-line)] dark:divide-[var(--tt-pc-line)]">
                {pairs.length === 0 && (
                  <div className="px-4 py-3 text-sm text-gray-500 dark:text-zinc-400">Пар нет</div>
                )}
                {pairs.map((pair, idx) => (
                  (() => {
                    const isNow = highlightedPairNumber === pair.pairNumber;
                    const isNext = nextHighlightedPairNumber === pair.pairNumber;
                    return (
                  <div
                    key={idx}
                    className={`relative ${pairPadding} border-l-4 ${getStatusColor(pair.status)} ${isNow || isNext ? "pl-12" : ""}`}
                  >
                    {isNow && (
                      <div className="absolute left-0 top-0 bottom-0 w-8 bg-orange-100 dark:bg-orange-500/10 border-r border-orange-300 dark:border-orange-500/30 flex items-center justify-center">
                        <span
                          className="text-[11px] font-bold text-orange-800 dark:text-orange-300/80 tracking-wide"
                          style={{ transform: "rotate(-90deg)" }}
                        >
                          Сейчас
                        </span>
                      </div>
                    )}
                    {isNext && (
                      <div className="absolute left-0 top-0 bottom-0 w-8 bg-[var(--app-accent-soft)] border-r border-[var(--app-accent-muted)] flex items-center justify-center">
                        <span
                          className="text-[11px] font-bold text-[var(--app-accent)] tracking-wide"
                          style={{ transform: "rotate(-90deg)" }}
                        >
                          Ближ.
                        </span>
                      </div>
                    )}
                    <div className="flex items-start justify-between gap-3">
                      <div className={`flex items-start ${hidePairNumbers ? "gap-0" : "gap-3"}`}>
                        {!hidePairNumbers ? (
                          <span className={`font-bold text-gray-700 dark:text-zinc-200 ${pairNumberClass} text-center`}>
                            {pair.pairNumber}
                          </span>
                        ) : null}
                        <div className={hidePairNumbers ? "min-w-0 flex-1" : ""}>
                          <div className="text-[11px] font-semibold text-gray-700 dark:text-zinc-300">
                            {(() => {
                              const pairTime = getKbpPairTime(pair.pairNumber, bellDayIndex(dayIndex));
                              const range =
                                pairTime.start && pairTime.end
                                  ? `${formatBellClock(pairTime.start)} - ${formatBellClock(pairTime.end)}`
                                  : "—";
                              const cd = getCountdownParen(pair.pairNumber, dayIndex);
                              return cd ? `${range} (${cd})` : range;
                            })()}
                          </div>
                          <div className="min-w-0 overflow-hidden font-medium text-gray-900 dark:text-zinc-50">
                            {pair.subject ? (
                              <TimetableEntityLink
                                label={pair.subject}
                                className="font-medium text-gray-900 dark:text-zinc-50"
                                entity={{ type: "subject", id: pair.refs?.subject?.id }}
                              />
                            ) : (
                              " "
                            )}
                          </div>
                          {showPairMeta ? (
                          <div className="mt-1 flex min-w-0 flex-col gap-1 text-sm text-gray-600 dark:text-zinc-300">
                            {(() => {
                              const lines =
                                pair.lines?.length > 0
                                  ? pair.lines
                                  : [
                                      {
                                        group: pair.group
                                          ? { label: pair.group, id: pair.refs?.group?.id }
                                          : undefined,
                                        teacher: pair.teacher
                                          ? { label: pair.teacher, id: pair.refs?.teachers?.[0]?.id }
                                          : undefined,
                                        room: pair.room
                                          ? { label: pair.room, id: pair.refs?.place?.id }
                                          : undefined,
                                      },
                                    ];
                              const showGroupDash = showGroupEff && lines.some((l) => l.group);
                              return lines.map((line, li) => (
                                <div key={`line-${li}`} className="flex min-w-0 flex-col gap-1">
                                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                                    {showGroupEff && line.group ? (
                                      <TimetableEntityLink
                                        variant="pill"
                                        label={line.group.label}
                                        entity={{ type: "group", id: line.group.id }}
                                      />
                                    ) : showGroupDash ? (
                                      <span className="text-gray-400 dark:text-zinc-500" aria-hidden>
                                        —
                                      </span>
                                    ) : null}
                                    {showTeacherEff && line.teacher ? (
                                      <span className="flex min-w-0 max-w-full items-center gap-1 overflow-hidden">
                                        <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                        </svg>
                                        <TimetableEntityLink
                                          label={line.teacher.label}
                                          className="text-sm text-gray-600 dark:text-zinc-300"
                                          entity={{ type: "teacher", id: line.teacher.id }}
                                        />
                                      </span>
                                    ) : null}
                                    {showRoomEff && line.room ? (
                                      <span className="flex min-w-0 max-w-full items-center gap-1 overflow-hidden">
                                        <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                        </svg>
                                        <TimetableEntityLink
                                          label={`ауд. ${line.room.label}`}
                                          className="text-sm text-gray-600 dark:text-zinc-300"
                                          entity={{ type: "place", id: line.room.id }}
                                        />
                                      </span>
                                    ) : null}
                                  </div>
                                  {li === 0 && showGrades ? (
                                    <TimetableGradeBadges
                                      marks={marksForSubjectOnDate(
                                        journalData,
                                        pair.subject || pair.refs?.subject?.name || "",
                                        dayIso
                                      )}
                                    />
                                  ) : null}
                                </div>
                              ));
                            })()}
                            {(!pair.lines || pair.lines.length === 0) &&
                            !pair.group &&
                            !pair.teacher &&
                            !pair.room &&
                            showGrades ? (
                              <TimetableGradeBadges
                                marks={marksForSubjectOnDate(
                                  journalData,
                                  pair.subject || pair.refs?.subject?.name || "",
                                  dayIso
                                )}
                              />
                            ) : null}
                          </div>
                          ) : showGrades ? (
                            <div className="mt-1">
                              <TimetableGradeBadges
                                marks={marksForSubjectOnDate(
                                  journalData,
                                  pair.subject || pair.refs?.subject?.name || "",
                                  dayIso
                                )}
                              />
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                    );
                  })()
                ))}
                <div className="min-h-[30vh] flex-1" aria-hidden="true" />
              </div>
              </div>
            </div>
            </div>
          );
        })()}
      </div>

    </div>
  );
}
