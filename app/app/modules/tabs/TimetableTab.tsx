"use client";

import { useEffect, useState } from "react";
import TimetableSearchCompact from "@/app/components/TimetableSearchCompact";
import TimetableTabSkeleton from "@/app/components/app/TimetableTabSkeleton";
import TimetableView from "@/app/components/TimetableView";
import TimetableWeekSwitcher from "@/app/components/TimetableWeekSwitcher";
import FreeRoomsPanel from "@/app/components/FreeRoomsPanel";
import { themeIsDark, themePageBg, type AppTheme } from "@/lib/client/appTheme";
import { subscribePcTimetableView } from "@/lib/client/platform";
import { timetablePcSidePadClass } from "@/lib/client/timetablePcLayout";
import type { SearchResult } from "@/lib/client/searchApi";
import type { JournalData } from "@/lib/client/studentApi";

export type TimetableTabProps = {
  theme: AppTheme;
  selectedTimetable: unknown;
  selectedResult: SearchResult | null;
  kbpNotice: string;
  countdownToLesson: boolean;
  showReplacementsByDefault: boolean;
  timetableDensity: "normal" | "compact" | "small";
  timetableHideTeacherRoom: boolean;
  timetableShowGroup: boolean;
  timetableShowTeacher: boolean;
  timetableShowRoom: boolean;
  timetableHidePairNumbers: boolean;
  timetableDayStrip: boolean;
  timetablePcSidePad: boolean;
  timetableShowGrades?: boolean;
  journalData?: JournalData | null;
  onSelectResult: (result: SearchResult, timetableData: unknown) => void;
  onNavigateEntity: (
    type: "group" | "teacher" | "place" | "subject",
    id: string,
    name: string
  ) => void | Promise<void>;
  timetableLoading?: boolean;
  searchParams?: URLSearchParams;
  initialWeekPage?: 0 | 1 | null;
};

function FreeRoomsIconButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Свободные аудитории"
      aria-label="Свободные аудитории"
      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--app-accent)]/35 bg-[var(--app-accent-soft)] text-[var(--app-accent)]"
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
        />
      </svg>
    </button>
  );
}

export default function TimetableTab({
  theme,
  selectedTimetable,
  selectedResult,
  kbpNotice,
  countdownToLesson,
  showReplacementsByDefault,
  timetableDensity,
  timetableHideTeacherRoom,
  timetableShowGroup,
  timetableShowTeacher,
  timetableShowRoom,
  timetableHidePairNumbers,
  timetableDayStrip,
  timetablePcSidePad,
  timetableShowGrades = false,
  journalData = null,
  onSelectResult,
  onNavigateEntity,
  timetableLoading = false,
  searchParams,
  initialWeekPage = null,
}: TimetableTabProps) {
  const isDark = themeIsDark(theme);
  const [isPc, setIsPc] = useState(false);
  const [weekPage, setWeekPage] = useState(0);
  const [freeRoomsOpen, setFreeRoomsOpen] = useState(false);

  useEffect(() => subscribePcTimetableView(setIsPc), []);

  useEffect(() => {
    if (initialWeekPage === 0 || initialWeekPage === 1) {
      setWeekPage(initialWeekPage);
      return;
    }
    setWeekPage(0);
  }, [selectedResult?.id, selectedResult?.type, initialWeekPage]);

  const searchCentered = !selectedTimetable && !timetableLoading && !selectedResult;
  const contentPad = `px-4 ${timetablePcSidePadClass({ isPc, enabled: timetablePcSidePad })}`;
  const showFreeRoomsBtn = selectedResult?.type === "place";
  const freeRoomsAction = showFreeRoomsBtn ? (
    <FreeRoomsIconButton onClick={() => setFreeRoomsOpen(true)} />
  ) : null;

  return (
    <div
      className={`h-full overflow-x-hidden overflow-y-auto overscroll-x-none app-scroll ${themePageBg(theme)}`}
      style={{ touchAction: "pan-y" }}
    >
      <div
        className={`${contentPad} flex min-h-full flex-col transition-[justify-content,padding] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          searchCentered ? "justify-center py-8" : "justify-start py-4"
        }`}
      >
        {isPc ? (
          <div
            className={`relative mb-0 flex min-w-0 items-center gap-3 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              searchCentered ? "w-full max-w-md justify-center self-center" : ""
            }`}
          >
            <TimetableSearchCompact
              theme={theme}
              variant="pc"
              onSelectResult={onSelectResult}
              trailingAction={freeRoomsAction}
            />

            {!searchCentered && selectedResult ? (
              <div className="pointer-events-none absolute inset-x-0 flex justify-center px-4">
                <div className="max-w-[16rem] text-center">
                  <div className="truncate text-sm font-semibold text-gray-900 dark:text-zinc-100">
                    {selectedResult.name}
                  </div>
                  {selectedResult.typeLabel ? (
                    <div className="truncate text-[11px] text-gray-500 dark:text-zinc-400">
                      {selectedResult.typeLabel}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {!searchCentered && selectedTimetable ? (
              <div className="relative z-10 ml-auto shrink-0">
                <TimetableWeekSwitcher
                  timetable={selectedTimetable}
                  weekPage={weekPage}
                  onWeekPageChange={setWeekPage}
                />
              </div>
            ) : null}
          </div>
        ) : (
          <div
            className={`w-full transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              searchCentered ? "translate-y-0" : ""
            }`}
          >
            <TimetableSearchCompact
              theme={theme}
              onSelectResult={onSelectResult}
              trailingAction={freeRoomsAction}
            />
          </div>
        )}

        {timetableLoading ? (
          <div className="mt-4">
            <TimetableTabSkeleton theme={theme} isPc={isPc} />
          </div>
        ) : selectedTimetable ? (
          <div
            key={`${selectedResult?.type ?? "x"}-${selectedResult?.id ?? "x"}`}
            className={`min-w-0 timetable-load-in ${isPc ? "mt-4" : "mt-4"}`}
          >
            <TimetableView
              data={selectedTimetable}
              title={selectedResult?.name}
              subtitle={selectedResult?.typeLabel}
              onNavigateEntity={onNavigateEntity}
              countdownEnabled={countdownToLesson}
              defaultShowReplacements={showReplacementsByDefault}
              density={timetableDensity}
              hideTeacherRoom={timetableHideTeacherRoom}
              showGroup={timetableShowGroup}
              showTeacher={timetableShowTeacher}
              showRoom={timetableShowRoom}
              hidePairNumbers={timetableHidePairNumbers}
              showDayStrip={timetableDayStrip}
              weekPage={weekPage}
              onWeekPageChange={setWeekPage}
              hidePcChrome={isPc}
              searchParams={searchParams}
              showGrades={timetableShowGrades}
              journalData={journalData}
            />
          </div>
        ) : null}

        {kbpNotice && !searchCentered ? (
          <div className={`mt-3 text-center text-[11px] ${isDark ? "text-amber-300/80" : "text-amber-700"}`}>
            {kbpNotice}
          </div>
        ) : null}
        {kbpNotice && searchCentered ? (
          <div className={`mt-4 text-center text-sm ${isDark ? "text-amber-300/90" : "text-amber-700"}`}>
            {kbpNotice}
          </div>
        ) : null}
      </div>

      <FreeRoomsPanel
        theme={theme}
        open={freeRoomsOpen}
        onClose={() => setFreeRoomsOpen(false)}
        onSelectPlace={onSelectResult}
      />
    </div>
  );
}
