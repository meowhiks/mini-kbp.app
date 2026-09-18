"use client";

import dynamic from "next/dynamic";
import JournalLoginForm, { type JournalLoginFormProps } from "@/app/components/app/JournalLoginForm";
import JournalTabSkeleton from "@/app/components/app/JournalTabSkeleton";
import { themeIsDark, themePageBg, type AppTheme } from "@/lib/client/appTheme";
import type { JournalSkeletonMeta } from "@/lib/client/journalSkeletonMeta";
import { JournalEntryCard, type JournalEntry } from "../studentJournal";

const TeacherJournalWorkspace = dynamic(
  () => import("@/app/components/staff/TeacherJournalWorkspace"),
  { loading: () => null }
);

export type JournalTabProps = {
  theme: AppTheme;
  isStaffJournal: boolean;
  journalEntries: JournalEntry[];
  serverOffline: boolean;
  journalShowAverage: boolean;
  journalDenseCells: boolean;
  journalScalePercent: number;
  journalShowHundredths: boolean;
  journalShowTotal: boolean;
  showLegacyJournalLogin: boolean;
  showJournalLogin: boolean;
  onShowJournalLogin: (show: boolean) => void;
  loginFormProps: JournalLoginFormProps;
  journalLoading?: boolean;
  journalRefreshing?: boolean;
  journalSkeletonMeta?: JournalSkeletonMeta;
  journalFrozenEntry?: JournalEntry;
  isActive?: boolean;
};

export default function JournalTab({
  theme,
  isStaffJournal,
  journalEntries,
  serverOffline,
  journalShowAverage,
  journalDenseCells,
  journalScalePercent,
  journalShowHundredths,
  journalShowTotal,
  showLegacyJournalLogin,
  showJournalLogin,
  onShowJournalLogin,
  loginFormProps,
  journalLoading = false,
  journalRefreshing = false,
  journalSkeletonMeta,
  journalFrozenEntry,
  isActive = true,
}: JournalTabProps) {
  const isDark = themeIsDark(theme);

  return (
    <div className={`h-full overflow-x-hidden overflow-y-auto overscroll-x-none app-scroll ${themePageBg(theme)}`} style={{ touchAction: "pan-y" }}>
      {isStaffJournal ? (
        <TeacherJournalWorkspace variant="app" theme={theme} scalePercent={journalScalePercent} active={isActive} />
      ) : journalEntries.length > 0 ? (
        <div
          className={`min-w-0 space-y-3 ${journalRefreshing ? "pointer-events-none opacity-70" : ""}`}
          aria-busy={journalRefreshing}
        >
          {journalRefreshing ? (
            <div className="relative">
              <div className="pointer-events-none absolute inset-0 z-[1] animate-pulse bg-transparent" />
            </div>
          ) : null}
          {journalEntries.map((entry) => (
            <JournalEntryCard
              key={entry.id}
              entry={entry}
              theme={theme}
              showOfflineBadge={serverOffline}
              showAverageColumn={journalShowAverage}
              denseCells={journalDenseCells}
              scalePercent={journalScalePercent}
              showHundredths={journalShowHundredths}
              showTotal={journalShowTotal}
            />
          ))}
          {showLegacyJournalLogin && !showJournalLogin ? (
            <div className="px-4 pb-4">
              <button
                type="button"
                onClick={() => onShowJournalLogin(true)}
                className={`w-full rounded-lg border px-4 py-2.5 text-sm font-medium ${
                  isDark
                    ? "border-zinc-700 text-zinc-200 hover:bg-zinc-900"
                    : "border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                Добавить журнал (архив)
              </button>
            </div>
          ) : null}
          {showLegacyJournalLogin && showJournalLogin ? (
            <div className="px-4 pb-4">
              <JournalLoginForm {...loginFormProps} />
              <button
                type="button"
                onClick={() => onShowJournalLogin(false)}
                className={`mt-2 w-full text-center text-xs ${isDark ? "text-zinc-500" : "text-gray-400"}`}
              >
                Скрыть форму
              </button>
            </div>
          ) : null}
        </div>
      ) : journalLoading && journalFrozenEntry ? (
        <div className="pointer-events-none min-w-0 opacity-70" aria-busy="true">
          <JournalEntryCard
            entry={journalFrozenEntry}
            theme={theme}
            showOfflineBadge={serverOffline}
            showAverageColumn={journalShowAverage}
            denseCells={journalDenseCells}
            scalePercent={journalScalePercent}
            showHundredths={journalShowHundredths}
            showTotal={journalShowTotal}
          />
        </div>
      ) : journalLoading && journalSkeletonMeta ? (
        <JournalTabSkeleton theme={theme} meta={journalSkeletonMeta} />
      ) : showLegacyJournalLogin ? (
        <JournalLoginForm {...loginFormProps} />
      ) : (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-6 text-center">
          <p className={`text-sm ${isDark ? "text-zinc-400" : "text-gray-500"}`}>
            Загружаем журнал по вашему аккаунту…
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-sm font-medium text-[#3390ec] hover:underline"
          >
            Обновить
          </button>
        </div>
      )}
    </div>
  );
}
