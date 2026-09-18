"use client";

import { themeIsDark, type AppTheme } from "@/lib/client/appTheme";

export default function TeacherJournalSkeleton({ theme = "light" }: { theme?: AppTheme }) {
  const isDark = themeIsDark(theme);
  const bar = isDark ? "bg-zinc-800" : "bg-gray-200";
  const cell = isDark ? "bg-zinc-800/80" : "bg-gray-100";

  return (
    <div className="animate-pulse p-4" aria-busy="true" aria-label="Загрузка журнала">
      <div className="mb-3 flex gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={`h-8 w-20 rounded-lg ${bar}`} />
        ))}
      </div>
      <div className="overflow-x-auto">
        {Array.from({ length: 10 }, (_, row) => (
          <div key={row} className="mb-1 flex items-center gap-1">
            <div className={`h-8 w-28 shrink-0 rounded-lg ${bar}`} />
            {Array.from({ length: 12 }, (_, col) => (
              <div key={col} className={`h-8 w-8 shrink-0 rounded-md ${cell}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
