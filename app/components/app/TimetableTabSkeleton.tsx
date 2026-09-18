"use client";

import { Fragment } from "react";
import { themeIsDark, type AppTheme } from "@/lib/client/appTheme";

type TimetableTabSkeletonProps = {
  theme: AppTheme;
  isPc?: boolean;
};

export default function TimetableTabSkeleton({ theme, isPc = false }: TimetableTabSkeletonProps) {
  const isDark = themeIsDark(theme);

  const grays = isDark
    ? ["bg-zinc-800", "bg-zinc-700", "bg-zinc-900", "bg-zinc-800/80"]
    : ["bg-gray-200", "bg-gray-300", "bg-gray-100", "bg-gray-200/80"];

  const getGray = (i: number) => grays[i % grays.length];
  const getWidth = (i: number, min = 40, max = 90) => {
    const widths = [40, 60, 80, 90, 50, 70];
    const w = widths[i % widths.length];
    return `w-[${w}%]`;
  };

  const card = isDark ? "bg-zinc-900" : "bg-gray-50";

  if (isPc) {
    return (
      <div className="mt-4 animate-pulse space-y-3">
        <div className="overflow-hidden rounded-[5px] border border-gray-200 dark:border-zinc-700">
          <div
            className="grid bg-gray-200 dark:bg-zinc-700"
            style={{ gridTemplateColumns: "4rem repeat(6, 1fr)" }}
          >
            {/* Header Row */}
            <div className="h-10 bg-gray-100 dark:bg-zinc-800 border-b border-r border-gray-200 dark:border-zinc-700" />
            {Array.from({ length: 6 }, (_, i) => (
              <div key={`hdr-${i}`} className="h-10 bg-gray-100 dark:bg-zinc-800 border-b border-r border-gray-200 dark:border-zinc-700" />
            ))}

            {/* 13 Rows of pairs */}
            {Array.from({ length: 13 }, (_, rowIdx) => (
              <Fragment key={`row-${rowIdx}`}>
                {/* Pair Number Column */}
                <div className="h-16 bg-gray-50 dark:bg-zinc-900 border-b border-r border-gray-200 dark:border-zinc-700" />
                {/* Day Columns */}
                {Array.from({ length: 6 }, (_, colIdx) => {
                  const i = rowIdx * 6 + colIdx;
                  return (
                    <div
                      key={`cell-${rowIdx}-${colIdx}`}
                      className={`h-16 border-b border-r border-gray-200 dark:border-zinc-700 ${card} p-2`}
                    >
                      {/* 5-field layout simulation */}
                      <div className="flex justify-between items-start mb-1">
                        <div className={`h-2 rounded-[5px] ${getWidth(i)} ${getGray(i)}`} />
                        <div className={`h-2 rounded-[5px] ${getWidth(i + 1)} ${getGray(i + 1)}`} />
                      </div>
                      <div className="mb-2">
                        <div className={`h-3 rounded-[5px] ${getWidth(i + 2)} ${getGray(i + 2)}`} />
                      </div>
                      <div className="flex justify-between items-end">
                        <div className={`h-2 rounded-[5px] ${getWidth(i + 3)} ${getGray(i + 3)}`} />
                        <div className={`h-2 rounded-[5px] ${getWidth(i + 4)} ${getGray(i + 4)}`} />
                      </div>
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 animate-pulse space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={`day-${i}`} className={`h-9 w-12 shrink-0 rounded-[5px] ${getGray(i)}`} />
        ))}
      </div >

      {Array.from({ length: 5 }, (_, i) => (
        <div key={`pair-${i}`} className={`rounded-[5px] border p-4 ${isDark ? "border-zinc-800" : "border-gray-100"} ${card}`}>
          <div className="flex gap-3">
            <div className={`h-10 w-8 shrink-0 rounded-[5px] ${getGray(i)}`} />

            <div className="min-w-0 flex-1 space-y-2">
              {/* 5-field layout simulation for mobile */}
              <div className="flex justify-between items-center">
                <div className={`h-3 rounded-[5px] ${getWidth(i)} ${getGray(i)}`} />
                <div className={`h-3 rounded-[5px] ${getWidth(i + 1)} ${getGray(i + 1)}`} />
              </div>
              <div className={`h-4 rounded-[5px] ${getWidth(i + 2)} ${getGray(i + 2)}`} />
              <div className="flex justify-between items-center">
                <div className={`h-3 rounded-[5px] ${getWidth(i + 3)} ${getGray(i + 3)} ${getGray(i + 3)}`} />
                <div className={`h-3 rounded-[5px] ${getWidth(i + 4)} ${getGray(i + 4)}`} />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
