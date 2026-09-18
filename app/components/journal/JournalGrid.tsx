"use client";

import { useMemo, useState } from "react";
import type { AppTheme } from "@/lib/client/appTheme";
import { themeIsDark } from "@/lib/client/appTheme";
import {
  calcSubjectAverageFromMarks,
  calcTotalAverageFromSubjects,
  formatComputedAverage,
} from "@/lib/client/journalAverage";
import { journalMarkAlertStyle } from "@/lib/client/kbpApi";
import type { JournalGridData } from "@/lib/client/journalGridData";
import {
  STUDENT_MARK_CELL_DENSE_H,
  STUDENT_MARK_CELL_DENSE_W,
  STUDENT_MARK_CELL_H,
  STUDENT_ROW_H,
  STUDENT_SUBJECT_GAP_PX,
  clampJournalScalePercent,
  scaleJournalPx,
} from "@/lib/client/journalGridData";
import {
  dateColKeyFromIndex,
  getDateColWidth,
  startColumnResize,
  startDateColumnResize,
  useJournalColumnWidths,
} from "@/lib/client/journalColumnWidths";
import { useJournalHorizontalWheel } from "@/lib/client/useJournalHorizontalWheel";
import { gradeMarkTextClass, formatGradeMarkDisplay } from "@/lib/client/journalGradeMarks";
import { cellMarkFontPx, cellMarkSlice } from "@/lib/client/journalMarkCell";
import {
  journalHoverCellBg,
  journalHoverClear,
  journalHoverFromCell,
  journalHoverFromColumn,
  type JournalHoverState,
} from "@/lib/client/journalHover";

export type JournalGridMode = "read" | "edit";

type JournalGridProps = {
  data: JournalGridData;
  theme?: AppTheme;
  mode?: JournalGridMode;
  rowLabel?: string;
  showAverageColumn?: boolean;
  denseCells?: boolean;
  scalePercent?: number;
  showHundredths?: boolean;
  showTotal?: boolean;
  embedded?: boolean;
  highlightToday?: boolean;
  dayTypes?: Record<number, "normal" | "lab" | "okr">;
  footerNotes?: Record<number, string>;
  labOkrOnly?: boolean;
  labDueDates?: Record<number, string | null>;
  labCredited?: Record<number, boolean>;
  onCellEdit?: (rowId: number | string, dateIndex: number, value: string) => void;
  onAddDate?: (isoDate: string) => void;
};

function markCellStyle(width: number, height: number, bg: string) {
  return {
    width,
    height,
    minWidth: width,
    maxWidth: width,
    minHeight: height,
    maxHeight: height,
    boxSizing: "border-box" as const,
    padding: 0,
    backgroundColor: bg,
  };
}

function ResizeHandle({
  onMouseDown,
}: {
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      onMouseDown={onMouseDown}
      className="absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize hover:bg-[#3390ec]/60"
      style={{ touchAction: "none" }}
    />
  );
}

export default function JournalGrid({
  data,
  theme = "light",
  mode = "read",
  rowLabel = "Предмет",
  showAverageColumn = true,
  denseCells = false,
  scalePercent = 100,
  showHundredths = false,
  showTotal = true,
  embedded = false,
  highlightToday = false,
  dayTypes,
  footerNotes,
  labOkrOnly = false,
  labDueDates,
  labCredited,
  onCellEdit,
  onAddDate,
}: JournalGridProps) {
  const isDark = themeIsDark(theme);
  const isReadOnly = mode === "read";
  const scale = clampJournalScalePercent(scalePercent);
  const s = (px: number) => scaleJournalPx(px, scale);
  const cellBg = "var(--app-journal-cell)";
  const { widths, setWidth, setDateColWidth } = useJournalColumnWidths();
  const scrollRef = useJournalHorizontalWheel<HTMLDivElement>();
  const markColH = s(denseCells ? STUDENT_MARK_CELL_DENSE_H : STUDENT_MARK_CELL_H);
  const rowH = s(denseCells ? STUDENT_MARK_CELL_DENSE_H : STUDENT_ROW_H);
  const subjectColPx = s(widths.subjectCol);
  const avgColPx = s(widths.avgCol);
  const baseMarkCol = denseCells ? STUDENT_MARK_CELL_DENSE_W : widths.markCol;

  const dateColWidths = useMemo(
    () =>
      data.dates.map((_, idx) => {
        const key = dateColKeyFromIndex(idx, data.dateKeys[idx]);
        if (widths.dateCols?.[key] != null) return s(getDateColWidth(widths, key));
        return s(baseMarkCol);
      }),
    [data.dates, data.dateKeys, widths, denseCells, scale, baseMarkCol]
  );

  const defaultMarkW = dateColWidths[0] ?? s(baseMarkCol);
  const gapPx = s(STUDENT_SUBJECT_GAP_PX);

  const [selectedCell, setSelectedCell] = useState<{
    explanation: string;
    grades: string;
    lessonNote?: string;
  } | null>(null);
  const [hover, setHover] = useState<JournalHoverState>(journalHoverClear);
  const [selectedRowIdx, setSelectedRowIdx] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ row: number; col: number } | null>(null);
  const [editValue, setEditValue] = useState("");

  const todayIdx = data.todayIndex;

  const formatAvg = (row: (typeof data.rows)[0]): string =>
    formatComputedAverage(calcSubjectAverageFromMarks(row), showHundredths);

  const formatLabProgress = (row: (typeof data.rows)[0]): string => {
    if (!dayTypes) return "—";
    const labCols = data.dates
      .map((_, i) => i)
      .filter((i) => dayTypes[i] === "lab" || dayTypes[i] === "okr");
    const total = labCols.length;
    if (!total) return "—";
    let zach = 0;
    for (const i of labCols) {
      const val = row.gradesMatrix?.[i]?.[0]?.value?.trim().toLowerCase() ?? "";
      if (val === "зач") zach++;
    }
    return `${zach}/${total}`;
  };

  const totalAvg =
    !labOkrOnly && showTotal && showAverageColumn
      ? calcTotalAverageFromSubjects(data.rows, showHundredths)
      : null;

  const showFooterNotesRow =
    mode === "edit" && Boolean(footerNotes && Object.values(footerNotes).some((n) => n && String(n).trim()));

  const showFooterRow = totalAvg !== null || showFooterNotesRow;

  const todayBorder = (idx: number) =>
    highlightToday && todayIdx !== null && idx === todayIdx ? "journal-today-before" : "";

  const headerColBg = (dateIdx: number, defaultBg: string) => {
    if (!labOkrOnly) return defaultBg;
    const due = labDueDates?.[dateIdx];
    const t = dayTypes?.[dateIdx];
    if ((t === "lab" || t === "okr") && due) {
      const today = new Date();
      const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      if (due.slice(0, 10) < todayIso) return "#fecaca";
    }
    return defaultBg;
  };

  const markCellBg = (
    dateIdx: number,
    grades: Array<{ value?: string }>,
    defaultBg: string
  ) => {
    if (labOkrOnly) {
      const due = labDueDates?.[dateIdx];
      const t = dayTypes?.[dateIdx];
      if ((t === "lab" || t === "okr") && due) {
        const today = new Date();
        const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        if (due.slice(0, 10) < todayIso) return "#fecaca";
      }
    }
    return defaultBg;
  };

  if (!data.rows.length) {
    return (
      <div className="flex min-h-[200px] items-center justify-center px-4 py-4">
        <p className={isDark ? "text-zinc-400" : "text-gray-500"}>Нет данных</p>
      </div>
    );
  }

  const dateCount = data.dates.length;
  const hasAddCol = mode === "edit" && Boolean(onAddDate);
  const addColW = defaultMarkW;
  const tableWidthPx =
    subjectColPx +
    gapPx +
    dateColWidths.reduce((a, b) => a + b, 0) +
    (hasAddCol ? addColW : 0) +
    (showAverageColumn ? avgColPx : 0);

  const stickySubjectBg = "var(--app-journal-sticky)";
  const headerBg = "var(--app-journal-header)";
  const monthBg = "var(--app-journal-month)";

  const hoverBg = (base: string, rowIdx: number | null, colIdx: number) =>
    isReadOnly ? journalHoverCellBg(base, rowIdx, colIdx, hover.hoverRow, hover.hoverCol) : base;

  const readSubjectFontPx = Math.max(10, Math.round(11 * (scale / 100)));

  return (
    <div className={embedded ? "px-4 pb-4" : "px-4 pb-20"}>
      <div
        ref={scrollRef}
        className="journal-grid-shell app-scroll overflow-x-auto rounded-lg border bg-[var(--app-journal-sticky)]"
      >
        <table
          className="border-collapse text-xs"
          cellSpacing={0}
          cellPadding={0}
          style={{ tableLayout: "fixed", width: tableWidthPx }}
        >
          <colgroup>
            <col style={{ width: subjectColPx }} />
            <col style={{ width: gapPx }} />
            {data.dates.map((_, idx) => (
              <col key={idx} style={{ width: dateColWidths[idx] ?? defaultMarkW }} />
            ))}
            {hasAddCol ? <col style={{ width: addColW }} /> : null}
            {showAverageColumn ? <col style={{ width: avgColPx }} /> : null}
          </colgroup>
          <thead>
            <tr className="border-b border-[var(--app-journal-border)]">
              <th
                rowSpan={2}
                className="journal-grid-header-text relative sticky left-0 z-20 border-r px-2 py-1 text-left text-[14px] font-semibold leading-tight"
                style={{ width: subjectColPx, height: rowH, backgroundColor: headerBg, color: "var(--app-journal-text-header)" }}
              >
                {rowLabel}
                {mode === "edit" ? (
                  <ResizeHandle onMouseDown={(e) => startColumnResize(e, "subjectCol", widths.subjectCol, setWidth)} />
                ) : null}
              </th>
              <th
                rowSpan={2}
                className="p-0"
                style={{ width: gapPx, backgroundColor: headerBg }}
                aria-hidden
              />
              {data.months.map((month, i) => (
                <th
                  key={`${month}-${i}`}
                  colSpan={data.monthColspans[i]}
                  className="journal-grid-muted border-r px-1 py-1 text-center text-[13px] font-semibold leading-snug"
                  style={{ backgroundColor: monthBg, color: "var(--app-journal-text-muted)" }}
                >
                  {month}
                </th>
              ))}
              {hasAddCol ? (
                <th
                  rowSpan={2}
                  className="border-l border-r"
                  style={{ width: addColW, backgroundColor: headerBg, borderColor: "var(--app-journal-border)" }}
                >
                  <button
                    type="button"
                    title="Добавить день"
                    onClick={() => data.suggestAddKey && onAddDate?.(data.suggestAddKey)}
                    className="journal-grid-muted mx-auto flex items-center justify-center rounded text-[13px] font-bold hover:opacity-90"
                    style={{ width: addColW, height: markColH, color: "var(--app-journal-text-muted)" }}
                  >
                    +
                  </button>
                </th>
              ) : null}
              {showAverageColumn ? (
                <th
                  rowSpan={2}
                  className="journal-grid-header-text relative border-l px-1 py-1 text-center text-[13px] font-semibold leading-tight"
                  style={{ width: avgColPx, backgroundColor: headerBg, borderColor: "var(--app-journal-border)", color: "var(--app-journal-text-header)" }}
                >
                  {labOkrOnly ? "Лаб" : "Ср.зн"}
                  {mode === "edit" ? (
                    <ResizeHandle onMouseDown={(e) => startColumnResize(e, "avgCol", widths.avgCol, setWidth)} />
                  ) : null}
                </th>
              ) : null}
            </tr>
            <tr className="border-b border-[var(--app-journal-border)]">
              {data.dates.map((date, idx) => {
                const w = dateColWidths[idx] ?? defaultMarkW;
                const colKey = dateColKeyFromIndex(idx, data.dateKeys[idx]);
                return (
                  <td
                    key={idx}
                    className={`relative border-r text-center align-middle text-[13px] font-medium journal-grid-muted ${todayBorder(idx)}`}
                    style={{ ...markCellStyle(w, markColH, headerColBg(idx, headerBg)), color: "var(--app-journal-text-muted)" }}
                  >
                    {date}
                    {mode === "edit" ? (
                      <ResizeHandle
                        onMouseDown={(e) =>
                          startDateColumnResize(
                            e,
                            colKey,
                            widths.dateCols?.[colKey] ?? baseMarkCol,
                            setDateColWidth
                          )
                        }
                      />
                    ) : null}
                  </td>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, rowIdx) => {
              const isSelected = !isReadOnly && selectedRowIdx === rowIdx;
              const rowCellBg = isSelected ? "var(--app-journal-selected)" : cellBg;
              const stickyBg = isSelected ? "var(--app-journal-selected)" : stickySubjectBg;

              return (
                <tr
                  key={row.id}
                  className={`border-b ${
                    isReadOnly
                      ? "border-[var(--app-journal-border)]"
                      : `border-[var(--app-journal-border)] ${
                          isSelected
                            ? ""
                            : "hover:bg-[var(--app-journal-hover)]"
                        }`
                  }`}
                >
                  <td
                    className="sticky left-0 z-10 border-r px-1.5 py-1 font-semibold leading-tight"
                    style={{
                      width: subjectColPx,
                      maxWidth: subjectColPx,
                      minHeight: rowH,
                      backgroundColor: hoverBg(stickyBg, rowIdx, -1),
                      color: isSelected ? "var(--app-journal-text)" : "var(--app-journal-text-header)",
                      borderColor: "var(--app-journal-border)",
                    }}
                    title={row.fullName || row.name}
                    onMouseEnter={isReadOnly ? () => setHover(journalHoverFromCell(rowIdx, -1)) : undefined}
                    onMouseLeave={isReadOnly ? () => setHover(journalHoverClear) : undefined}
                  >
                    <span
                      className={isReadOnly ? "block break-words [overflow-wrap:anywhere]" : "block truncate"}
                      style={isReadOnly ? { fontSize: readSubjectFontPx } : { fontSize: 14 }}
                    >
                      {row.name}
                    </span>
                  </td>
                  <td
                    className="p-0"
                    style={{ width: gapPx, backgroundColor: hoverBg(rowCellBg, rowIdx, -1) }}
                    aria-hidden
                  />
                  {data.dates.map((_date, dateIdx) => {
                    const grades = row.gradesMatrix?.[dateIdx] || [];
                    const isEditing = editing?.row === rowIdx && editing?.col === dateIdx;
                    const explanation = grades.map((g) => g?.type).filter(Boolean).join(", ");
                    const gradeValues = grades.map((g) => g?.value).filter(Boolean).join(", ");
                    const colW = dateColWidths[dateIdx] ?? defaultMarkW;
                    const lessonNote = footerNotes?.[dateIdx]?.trim() || "";

                    return (
                      <td
                        key={dateIdx}
                        className={`border-r text-center align-middle ${todayBorder(dateIdx)}`}
                        style={markCellStyle(
                          colW,
                          markColH,
                          hoverBg(markCellBg(dateIdx, grades, rowCellBg), rowIdx, dateIdx)
                        )}
                        onMouseEnter={
                          isReadOnly ? () => setHover(journalHoverFromCell(rowIdx, dateIdx)) : undefined
                        }
                        onMouseLeave={isReadOnly ? () => setHover(journalHoverClear) : undefined}
                        onClick={(e) => {
                          if (mode === "edit") {
                            e.stopPropagation();
                            setEditing({ row: rowIdx, col: dateIdx });
                            setEditValue(gradeValues);
                            return;
                          }
                          setSelectedCell({
                            explanation: explanation || "Нет пояснения",
                            grades: gradeValues || "Нет оценок",
                            lessonNote: lessonNote || undefined,
                          });
                        }}
                      >
                        {isEditing ? (
                          <input
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => {
                              onCellEdit?.(row.id, dateIdx, editValue);
                              setEditing(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                onCellEdit?.(row.id, dateIdx, editValue);
                                setEditing(null);
                              }
                              if (e.key === "Escape") setEditing(null);
                            }}
                            className="h-full w-full border-0 bg-transparent text-center text-[13px] outline-none"
                            style={{ color: "var(--app-journal-text)" }}
                            maxLength={8}
                          />
                        ) : (
                          (() => {
                            const { visible, showEllipsis } = cellMarkSlice(grades);
                            const marksInCell = visible.length + (showEllipsis ? 1 : 0);
                            return (
                              <div className="flex h-full w-full items-center justify-center gap-px px-0.5">
                                {visible.map((grade, gIdx) => {
                                  const display = formatGradeMarkDisplay(grade?.value ?? "");
                                  return (
                                    <span
                                      key={gIdx}
                                      className={`${gradeMarkTextClass(display, { labOkrOnly })} shrink-0 font-medium leading-none`}
                                      style={{
                                        fontSize: cellMarkFontPx(
                                          display,
                                          marksInCell,
                                          scale,
                                          denseCells
                                        ),
                                        ...(grade?.kind === "alert"
                                          ? {
                                              ...journalMarkAlertStyle("alert"),
                                              ...(isDark ? { color: "#f87171" } : {}),
                                            }
                                          : labOkrOnly
                                            ? undefined
                                            : { color: "var(--app-journal-text)" }),
                                      }}
                                    >
                                      {display}
                                    </span>
                                  );
                                })}
                                {showEllipsis ? (
                                  <span
                                    className="journal-grid-muted shrink-0 font-medium leading-none"
                                    style={{
                                      fontSize: cellMarkFontPx("…", marksInCell, scale, denseCells),
                                      color: "var(--app-journal-text-muted)",
                                    }}
                                  >
                                    …
                                  </span>
                                ) : null}
                              </div>
                            );
                          })()
                        )}
                      </td>
                    );
                  })}
                  {hasAddCol ? (
                    <td
                      className="border-l border-r"
                      style={markCellStyle(addColW, markColH, rowCellBg)}
                    />
                  ) : null}
                  {showAverageColumn ? (
                    <td
                      className="journal-grid-header-text border-l px-1 text-center align-middle text-[13px] font-bold"
                      style={{
                        width: avgColPx,
                        minWidth: avgColPx,
                        maxWidth: avgColPx,
                        height: rowH,
                        backgroundColor: hoverBg(
                          isSelected ? (isDark ? "#1e3a5f" : "#bfdbfe") : rowCellBg,
                          rowIdx,
                          -1
                        ),
                        color: "var(--app-journal-text-header)",
                        borderColor: "var(--app-journal-border)",
                      }}
                    >
                      {labOkrOnly ? formatLabProgress(row) : formatAvg(row)}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
          {showFooterRow && (
            <tfoot>
              <tr className="border-t border-[var(--app-journal-border)]">
                <td
                  className="sticky left-0 z-10 border-r p-0"
                  style={{ width: subjectColPx, height: rowH, backgroundColor: headerBg, borderColor: "var(--app-journal-border)" }}
                />
                <td className="p-0" style={{ width: gapPx, backgroundColor: headerBg }} aria-hidden />
                {data.dates.map((_, i) => {
                  const w = dateColWidths[i] ?? defaultMarkW;
                  const note = showFooterNotesRow ? footerNotes?.[i] : undefined;
                  return (
                  <td
                    key={i}
                    className={`journal-grid-muted border-r text-center align-middle ${todayBorder(i)}`}
                    style={{ ...markCellStyle(w, showFooterNotesRow ? rowH + 16 : rowH, headerColBg(i, headerBg)), height: showFooterNotesRow ? rowH + 16 : rowH, color: "var(--app-journal-text-muted)" }}
                    title={note || ""}
                  >
                    {note ? (
                      <div className="flex h-full items-center justify-center px-0.5">
                        <span
                          className="mx-auto block max-h-[56px] overflow-hidden leading-tight"
                          style={{
                            writingMode: "vertical-rl",
                            transform: "rotate(180deg)",
                            fontSize: 18,
                          }}
                        >
                          {note}
                        </span>
                      </div>
                    ) : null}
                  </td>
                  );
                })}
                {hasAddCol ? (
                  <td style={markCellStyle(addColW, markColH, headerBg)} />
                ) : null}
                <td
                  className="journal-grid-header-text border-l px-1 text-center align-middle text-[13px] font-bold"
                  style={{
                    width: avgColPx,
                    minWidth: avgColPx,
                    maxWidth: avgColPx,
                    height: rowH,
                    backgroundColor: headerBg,
                    borderColor: "var(--app-journal-border)",
                    color: theme === "oled" ? "#5eb0ff" : isDark ? "#60a5fa" : "#2563eb",
                  }}
                >
                  {labOkrOnly ? "—" : (totalAvg ?? "")}
                </td>
              </tr>
            </tfoot>
          )}
        </table>

        {mode === "edit" && onAddDate && data.suggestAddKey ? (
          <div className="border-t border-[var(--app-journal-border)] px-3 py-2">
            <button
              type="button"
              onClick={() => onAddDate(data.suggestAddKey!)}
              className="journal-grid-muted rounded-lg border border-dashed px-3 py-1.5 text-xs font-medium hover:opacity-90"
              style={{ borderColor: "var(--app-journal-border)", color: "var(--app-journal-text-muted)" }}
            >
              + Добавить день ({data.suggestAddKey.slice(8, 10)}.{data.suggestAddKey.slice(5, 7)})
            </button>
          </div>
        ) : null}
      </div>

      {selectedCell && mode === "read" ? (
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
            <span className="font-semibold">Оценки:</span> {selectedCell.grades}
          </div>
          {selectedCell.lessonNote ? (
            <div className="mt-1">
              <span className="font-semibold">Урок:</span> {selectedCell.lessonNote}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
