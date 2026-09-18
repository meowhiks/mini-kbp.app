"use client";

import type { JournalSkeletonMeta } from "@/lib/client/journalSkeletonMeta";
import { themeIsDark, type AppTheme } from "@/lib/client/appTheme";

type JournalTabSkeletonProps = {
  theme: AppTheme;
  meta: JournalSkeletonMeta;
};

export default function JournalTabSkeleton({ theme, meta }: JournalTabSkeletonProps) {
  const isDark = themeIsDark(theme);
  const bar = isDark ? "bg-zinc-800" : "bg-gray-200";
  const cell = isDark ? "bg-zinc-800/80" : "bg-gray-100";
  const dayCols = Math.min(meta.dayCount, 24);

  return (
    <div className="mx-0 animate-pulse border-b pb-4" style={{ borderColor: "var(--app-journal-border)" }}>
      <div className="flex items-center gap-2 px-4 pt-3">
        <div className={`h-4 w-40 rounded-lg ${bar}`} />
      </div>

      <div className="mt-3 overflow-x-auto px-2">
        <div className="inline-block min-w-full">
          <div className="mb-2 flex gap-1 px-2">
            <div className={`h-3 w-24 shrink-0 rounded ${bar}`} />
            {Array.from({ length: dayCols }, (_, i) => (
              <div key={`d-${i}`} className={`h-3 w-7 shrink-0 rounded ${cell}`} />
            ))}
          </div>

          {Array.from({ length: meta.subjectCount }, (_, row) => (
            <div key={`r-${row}`} className="mb-1.5 flex items-center gap-1 px-2">
              <div className={`h-8 w-24 shrink-0 rounded-lg ${bar}`} />
              {Array.from({ length: dayCols }, (_, col) => (
                <div key={`c-${row}-${col}`} className={`h-8 w-7 shrink-0 rounded-md ${cell}`} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
