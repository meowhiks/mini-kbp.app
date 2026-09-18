"use client";

import { useState } from "react";
import { themeIsDark, type AppTheme } from "@/lib/client/appTheme";
import JournalGrid from "@/app/components/journal/JournalGrid";
import {
  JOURNAL_SCALE_DEFAULT,
  clampJournalScalePercent,
  scaleJournalPx,
  findTodayIndexStudent,
  STUDENT_MARK_CELL_DENSE_H,
  STUDENT_MARK_CELL_DENSE_W,
  STUDENT_MARK_CELL_H,
  STUDENT_MARK_CELL_W,
  STUDENT_SUBJECT_COL_PX,
  STUDENT_SUBJECT_GAP_PX,
} from "@/lib/client/journalGridData";
import {
  calcSubjectAverageFromMarks,
  formatComputedAverage,
} from "@/lib/client/journalAverage";
import {
  journalHoverCellBg,
  journalHoverClear,
  journalHoverFromCell,
  journalHoverFromColumn,
  type JournalHoverState,
} from "@/lib/client/journalHover";

export type JournalEntry = {
  id: string;
  surname: string;
  groupId: string;
  groupName: string;
  data: any;
  latenessData?: any | null;
  savedAt?: number;
  offline?: boolean;
};

export function JournalEntryCard({
  entry,
  theme,
  showOfflineBadge = false,
  showAverageColumn,
  denseCells,
  scalePercent,
  showHundredths,
  showTotal,
}: {
  entry: JournalEntry;
  theme: AppTheme;
  showOfflineBadge?: boolean;
  showAverageColumn: boolean;
  denseCells: boolean;
  scalePercent: number;
  showHundredths: boolean;
  showTotal: boolean;
}) {
  const [mode, setMode] = useState<"journal" | "lateness" | "lab_okr">("journal");
  const isDark = themeIsDark(theme);
  const isOled = theme === "oled";
  const hasLateness = Boolean(entry.latenessData?.subjects?.length);
  const hasLabOkr = Boolean(
    entry.data?.dayTypes &&
      Object.values(entry.data.dayTypes as Record<string, string>).some((t) => t === "lab" || t === "okr")
  );

  return (
    <div className="mx-0 border-b" style={{ borderColor: "var(--app-journal-border)" }}>
      <div
        className="flex flex-wrap items-center gap-2 px-4 pt-3"
        style={{ color: "var(--app-journal-text-header)" }}
      >
        <div className="min-w-0 flex-1 text-sm font-medium leading-snug break-words [overflow-wrap:anywhere]">
          {entry.surname || "Студент"}
          {entry.groupName ? ` · ${entry.groupName}` : ""}
        </div>
        {showOfflineBadge ? (
          <span
            className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${
              isDark ? "bg-amber-900/40 text-amber-300" : "bg-amber-50 text-amber-700"
            }`}
          >
            Офлайн
          </span>
        ) : null}
        <div
          className="flex rounded-lg border p-0.5"
          style={{ borderColor: "var(--app-journal-border)" }}
        >
          {hasLabOkr ? (
            <button
              type="button"
              onClick={() => setMode("lab_okr")}
              className={`rounded-md px-2 py-1 text-[10px] font-medium leading-tight sm:text-xs ${
                mode === "lab_okr"
                  ? isOled
                    ? "bg-[#5eb0ff] text-black"
                    : "bg-blue-500 text-white"
                  : "journal-grid-muted"
              }`}
              style={mode !== "lab_okr" ? { color: "var(--app-journal-text-muted)" } : undefined}
            >
              Лаб. и ОКР
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setMode("journal")}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${
              mode === "journal"
                ? isOled
                  ? "bg-[#5eb0ff] text-black"
                  : "bg-blue-500 text-white"
                : ""
            }`}
            style={mode !== "journal" ? { color: "var(--app-journal-text-muted)" } : undefined}
          >
            Журнал
          </button>
          <button
            type="button"
            onClick={() => setMode("lateness")}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${
              mode === "lateness"
                ? isOled
                  ? "bg-[#5eb0ff] text-black"
                  : "bg-blue-500 text-white"
                : ""
            }`}
            style={mode !== "lateness" ? { color: "var(--app-journal-text-muted)" } : undefined}
          >
            Опоздания
          </button>
        </div>
      </div>
      {mode === "journal" || mode === "lab_okr" ? (
        <JournalView
          data={entry.data}
          theme={theme}
          studentSurname={entry.surname}
          groupName={entry.groupName}
          showAverageColumn={showAverageColumn}
          denseCells={denseCells}
          scalePercent={scalePercent}
          showHundredths={showHundredths}
          showTotal={showTotal}
          labOkrOnly={mode === "lab_okr"}
          embedded
        />
      ) : (
        <LatenessView
          data={entry.latenessData}
          theme={theme}
          denseCells={denseCells}
          scalePercent={scalePercent}
          hasData={hasLateness}
        />
      )}
    </div>
  );
}

// Journal View Component
function remapDayTypes(
  src: Record<number | string, string>,
  indexMap?: Record<number, number>
): Record<number, string> {
  if (!indexMap) {
    const out: Record<number, string> = {};
    for (const [k, v] of Object.entries(src)) out[Number(k)] = v;
    return out;
  }
  const out: Record<number, string> = {};
  for (const [oldIdx, newIdx] of Object.entries(indexMap)) {
    const v = src[Number(oldIdx)];
    if (v) out[Number(newIdx)] = v;
  }
  return out;
}

function remapGradesMatrix(
  matrix: Record<number, unknown>,
  indexMap?: Record<number, number>
): Record<number, unknown> {
  if (!indexMap) return matrix;
  const out: Record<number, unknown> = {};
  for (const [oldIdx, newIdx] of Object.entries(indexMap)) {
    if (matrix[Number(oldIdx)]) out[Number(newIdx)] = matrix[Number(oldIdx)];
  }
  return out;
}

function filterLabOkrJournalData(data: any) {
  const dayTypes: Record<number, string> = data.dayTypes || {};
  const keep = Object.entries(dayTypes)
    .filter(([, t]) => t === "lab" || t === "okr")
    .map(([i]) => Number(i))
    .sort((a, b) => a - b);
  const indexMap: Record<number, number> = {};
  keep.forEach((oldIdx, newIdx) => {
    indexMap[oldIdx] = newIdx;
  });
  const dates = keep.map((i) => data.dates[i]);
  const months: string[] = [];
  const monthColspans: number[] = [];
  let colStart = 0;
  for (let mi = 0; mi < (data.monthColspans || []).length; mi++) {
    const span = data.monthColspans[mi];
    const monthName = data.months[mi];
    let count = 0;
    for (let c = colStart; c < colStart + span; c++) {
      if (keep.includes(c)) count += 1;
    }
    if (count) {
      months.push(monthName);
      monthColspans.push(count);
    }
    colStart += span;
  }
  return { ...data, dates, months, monthColspans, _indexMap: indexMap };
}

function JournalView({
  data,
  theme,
  studentSurname,
  groupName,
  showAverageColumn = true,
  denseCells = false,
  scalePercent = JOURNAL_SCALE_DEFAULT,
  showHundredths = false,
  showTotal = true,
  labOkrOnly = false,
  embedded = false,
}: {
  data: any;
  theme: AppTheme;
  studentSurname?: string;
  groupName?: string;
  showAverageColumn?: boolean;
  denseCells?: boolean;
  scalePercent?: number;
  showHundredths?: boolean;
  showTotal?: boolean;
  labOkrOnly?: boolean;
  embedded?: boolean;
}) {
  const isDark = themeIsDark(theme);

  if (!data?.subjects || data.subjects.length === 0) {
    return (
      <div className="flex min-h-full items-center justify-center p-4">
        <p className={isDark ? "text-slate-400" : "text-gray-500"}>Нет данных журнала</p>
      </div>
    );
  }

  const source = labOkrOnly ? filterLabOkrJournalData(data) : data;

  if (labOkrOnly && (!source.dates || source.dates.length === 0)) {
    return (
      <div className="flex min-h-full items-center justify-center p-4">
        <p className={isDark ? "text-slate-400" : "text-gray-500"}>Нет лабораторных или ОКР</p>
      </div>
    );
  }

  const todayIndex = findTodayIndexStudent(
    source.dates || [],
    source.monthColspans || [],
    source.months || []
  );

  const gridData = {
    months: source.months || [],
    monthColspans: source.monthColspans || [],
    dates: source.dates || [],
    dateKeys: (source.dates || []).map(String),
    rows: (source.subjects || []).map((s: any, i: number) => ({
      id: s.id ?? i,
      name: s.shortName || s.short_name || s.name,
      fullName: s.fullName || s.full_name || s.name,
      gradesMatrix: remapGradesMatrix(s.gradesMatrix || {}, source._indexMap),
    })),
    todayIndex,
    suggestAddKey: null,
    dayTypes: remapDayTypes(source.dayTypes || {}, source._indexMap) as Record<
      number,
      "normal" | "lab" | "okr"
    >,
    footerNotes: remapDayTypes(source.footerNotes || {}, source._indexMap) as Record<number, string>,
    labDueDates: remapDayTypes(source.labDueDates || {}, source._indexMap) as Record<number, string | null>,
    labCredited: (() => {
      const out: Record<number, boolean> = {};
      const src = source.labCredited || {};
      if (!source._indexMap) {
        for (const [k, v] of Object.entries(src)) out[Number(k)] = Boolean(v);
        return out;
      }
      for (const [oldIdx, newIdx] of Object.entries(source._indexMap)) {
        if (src[Number(oldIdx)]) out[Number(newIdx)] = true;
      }
      return out;
    })(),
  };

  return (
    <div className={embedded ? "" : "pb-20"}>
      {!embedded && (
        <div className="mb-3 px-4">
          <div className={`truncate text-sm ${isDark ? "text-zinc-300" : "text-gray-700"}`}>
            {studentSurname || "Студент"}
            {groupName ? ` В· ${groupName}` : ""}
          </div>
        </div>
      )}
      <JournalGrid
        data={gridData}
        theme={theme}
        mode="read"
        rowLabel="Предмет"
        showAverageColumn={showAverageColumn}
        denseCells={denseCells}
        scalePercent={scalePercent}
        showHundredths={showHundredths}
        showTotal={showTotal}
        highlightToday={false}
        dayTypes={gridData.dayTypes}
        footerNotes={gridData.footerNotes}
        labOkrOnly={labOkrOnly}
        labDueDates={gridData.labDueDates}
        labCredited={gridData.labCredited}
        embedded
      />
    </div>
  );
}

function LatenessView({
  data,
  theme,
  denseCells = false,
  scalePercent = JOURNAL_SCALE_DEFAULT,
  hasData = false,
}: {
  data: any;
  theme: AppTheme;
  denseCells?: boolean;
  scalePercent?: number;
  hasData?: boolean;
}) {
  const isDark = themeIsDark(theme);
  const scale = clampJournalScalePercent(scalePercent);
  const s = (px: number) => scaleJournalPx(px, scale);
  const cellBg = "var(--app-journal-cell)";
  const headerBg = "var(--app-journal-header)";
  const monthBg = "var(--app-journal-month)";
  const stickyBg = "var(--app-journal-sticky)";
  const markColW = s(denseCells ? STUDENT_MARK_CELL_DENSE_W : STUDENT_MARK_CELL_W);
  const markColH = s(denseCells ? STUDENT_MARK_CELL_DENSE_H : STUDENT_MARK_CELL_H);
  const subjectColPx = s(STUDENT_SUBJECT_COL_PX);
  const gapPx = s(STUDENT_SUBJECT_GAP_PX);

  const [selectedCell, setSelectedCell] = useState<{ explanation: string; value: string } | null>(null);
  const [hover, setHover] = useState<JournalHoverState>(journalHoverClear);

  const hoverBg = (base: string, rowIdx: number | null, colIdx: number) =>
    journalHoverCellBg(base, rowIdx, colIdx, hover.hoverRow, hover.hoverCol);

  const tableWidth =
    subjectColPx +
    gapPx +
    (data.dates?.length || 0) * markColW;

  if (!hasData || !data?.subjects || data.subjects.length === 0) {
    return (
      <div className="flex min-h-[120px] items-center justify-center p-4">
        <p className="text-sm" style={{ color: "var(--app-journal-text-muted)" }}>
          Нет данных об опозданиях
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 pb-6">
      <div className="journal-grid-shell app-scroll overflow-x-auto rounded-lg border bg-[var(--app-journal-sticky)]">
        <table
          className="border-collapse text-xs"
          cellSpacing={0}
          cellPadding={0}
          style={{ tableLayout: "fixed", width: tableWidth }}
          onMouseLeave={() => setHover(journalHoverClear)}
        >
          <colgroup>
            <col style={{ width: subjectColPx }} />
            <col style={{ width: gapPx }} />
            {(data.dates || []).map((_d: string, idx: number) => (
              <col key={idx} style={{ width: markColW }} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b" style={{ backgroundColor: headerBg }}>
              <th
                rowSpan={2}
                className="journal-grid-header-text sticky left-0 z-10 border-r px-2 py-1 text-left text-[14px] font-semibold"
                style={{ width: subjectColPx, height: markColH, backgroundColor: headerBg }}
                onMouseEnter={() => setHover(journalHoverClear)}
              >
                Предмет
              </th>
              <th rowSpan={2} className="p-0" style={{ width: gapPx, backgroundColor: headerBg }} aria-hidden />
              {(data.months || []).map((month: string, i: number) => (
                <th
                  key={`${month}-${i}`}
                  colSpan={(data.monthColspans || [])[i]}
                  className="journal-grid-muted border-r px-1 py-1 text-center text-[13px] font-semibold"
                  style={{ backgroundColor: monthBg }}
                >
                  {month}
                </th>
              ))}
            </tr>
            <tr className="border-b" style={{ backgroundColor: monthBg }}>
              {(data.dates || []).map((date: string, idx: number) => (
                <td
                  key={idx}
                  className="journal-grid-muted border-r px-0 py-0 text-center text-[13px] font-medium transition-colors"
                  style={{
                    width: markColW,
                    height: markColH,
                    minWidth: markColW,
                    maxWidth: markColW,
                    backgroundColor: hoverBg(headerBg, null, idx),
                  }}
                  onMouseEnter={() => setHover(journalHoverFromColumn(idx))}
                >
                  {date}
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.subjects.map((subject: any, rowIdx: number) => (
              <tr key={rowIdx} className="border-b">
                <td
                  className="journal-grid-header-text sticky left-0 z-10 border-r px-2 py-0 text-[14px] font-semibold transition-colors"
                  style={{
                    backgroundColor: hoverBg(stickyBg, rowIdx, -1),
                    height: markColH,
                  }}
                  onMouseEnter={() => setHover(journalHoverFromCell(rowIdx, -1))}
                >
                  {subject.shortName || subject.short_name || subject.name}
                </td>
                <td
                  className="p-0"
                  style={{ width: gapPx, backgroundColor: hoverBg(stickyBg, rowIdx, -1) }}
                  aria-hidden
                  onMouseEnter={() => setHover(journalHoverFromCell(rowIdx, -1))}
                />
                {(data.dates || []).map((_date: string, dateIdx: number) => {
                  const marks = subject.latenessMatrix?.[dateIdx] || [];
                  const explanation = marks.map((m: any) => m?.type).filter(Boolean).join(", ");
                  const values = marks.map((m: any) => m?.value).filter(Boolean).join(", ");
                  return (
                    <td
                      key={dateIdx}
                      className="cursor-pointer border-r text-center align-middle transition-colors"
                      style={{
                        width: markColW,
                        height: markColH,
                        minWidth: markColW,
                        maxWidth: markColW,
                        backgroundColor: hoverBg(cellBg, rowIdx, dateIdx),
                      }}
                      onMouseEnter={() => setHover(journalHoverFromCell(rowIdx, dateIdx))}
                      onClick={() =>
                        marks.length > 0
                          ? setSelectedCell({
                              explanation: explanation || "Опоздание",
                              value: values || "—",
                            })
                          : undefined
                      }
                    >
                      <div className="flex flex-wrap items-center justify-center gap-0.5">
                        {marks.slice(0, 3).map((mark: any, mIdx: number) => (
                          <span
                            key={mIdx}
                            className="inline-flex items-center justify-center text-[13px] font-semibold leading-none text-red-600 dark:text-red-400"
                          >
                            {mark.value}
                          </span>
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selectedCell && (
        <div
          className="mt-3 rounded-lg border px-3 py-2 text-sm"
          style={{
            borderColor: "var(--app-journal-border)",
            backgroundColor: "var(--app-journal-sticky)",
            color: "var(--app-journal-text)",
          }}
        >
          <div>
            <span className="font-semibold">Пояснение:</span> {selectedCell.explanation}
          </div>
          <div className="mt-1">
            <span className="font-semibold">Значение:</span> {selectedCell.value}
          </div>
        </div>
      )}
    </div>
  );
}