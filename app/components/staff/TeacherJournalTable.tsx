"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  type TeacherJournalGridData,
  LAB_OVERDUE_BG,
  columnKey,
  formatColumnDateFull,
  isLabColumnOverdue,
} from "@/lib/client/teacherJournalGrid";
import { formatStudentShortName } from "@/lib/client/displayNameParts";
import { todayBorderRight } from "@/lib/client/journalToday";
import { STUDENT_ROW_H, STUDENT_SUBJECT_COL_PX, clampJournalScalePercent } from "@/lib/client/journalGridData";
import {
  getDateColWidth,
  getIndexColWidth,
  startColumnResize,
  startDateColumnResize,
  startMonthColumnsResize,
  useJournalColumnWidths,
} from "@/lib/client/journalColumnWidths";
import { useJournalHorizontalWheel } from "@/lib/client/useJournalHorizontalWheel";
import {
  gradeMarkMatches,
  gradeMarkTextClass,
  formatGradeMarkDisplay,
  SPECIAL_GRADE_MARKS,
} from "@/lib/client/journalGradeMarks";
import { presenceColor, presenceCellKey, type PresencePeer } from "@/lib/client/journalPresence";
import JournalAnchorPopover from "@/app/components/journal/JournalAnchorPopover";
import type { JournalMenuBackdrop } from "@/lib/client/journalMenuBackdrop";
import {
  journalHoverCellBg,
  journalHoverClear,
  journalHoverFromCell,
  journalHoverFromColumn,
  type JournalHoverState,
} from "@/lib/client/journalHover";
import { createAutosaveScheduler } from "@/lib/client/adminAutosave";

const ROW_H = STUDENT_ROW_H;
const MIN_DATE_COL = 40;
const DATE_HEADER_H = 44;
const FOOTER_ROW_H = 72;
const FOOTER_FONT_PX = 11;
const NAME_COL_MAX_MOBILE = 108;

function resolveGradeValue(value: string, colIndex: number, redAbsent: Record<number, boolean>): string {
  const v = value.trim();
  if (!v) return "";
  if (v === "н" && redAbsent[colIndex]) return "н.";
  return v;
}

function gradeCellClass(val: string, labOkrOnlyMode: boolean): string {
  return gradeMarkTextClass(val, { labOkrOnly: labOkrOnlyMode });
}

function monthDateRange(monthIdx: number, colspans: number[]) {
  let start = 0;
  for (let i = 0; i < monthIdx; i++) start += colspans[i] ?? 0;
  return { start, count: colspans[monthIdx] ?? 0 };
}

type UndoFn = () => void;
type GradeMeta = { gradeId?: number };

type AsyncResult = void | boolean | Promise<void | boolean>;

type TeacherJournalTableProps = {
  data: TeacherJournalGridData;
  readOnly?: boolean;
  embedded?: boolean;
  hideAddColumn?: boolean;
  onGrade: (studentId: number, dateIndex: number, value: string, undo: UndoFn, meta?: GradeMeta) => AsyncResult;
  onAddToday: () => void;
  columnBusy?: boolean;
  onAddLesson: (dateIndex: number) => AsyncResult;
  onDeleteDate: (dateIndex: number) => AsyncResult;
  onDayType: (dateIndex: number, type: "normal" | "lab" | "okr") => AsyncResult;
  onFooterNote: (dateIndex: number, note: string) => AsyncResult;
  onLabDueDate?: (dateIndex: number, dueDate: string | null) => AsyncResult;
  onLabCredited?: (dateIndex: number, credited: boolean) => AsyncResult;
  onRedAbsent?: (dateIndex: number, redAbsent: boolean) => AsyncResult;
  labOkrOnly?: boolean;
  scalePercent?: number;
  isDark?: boolean;
  onUndo?: () => void;
  canUndo?: boolean;
  onStudentClick?: (studentId: number, studentName: string) => void;
  presencePeers?: PresencePeer[];
  onCellFocus?: (studentId: number, dateIndex: number) => void;
  menuBackdrop?: JournalMenuBackdrop;
};

function estimateNameColWidth(names: string[], minW: number): number {
  if (!names.length) return minW;
  const longest = names.reduce((a, b) => (a.length >= b.length ? a : b), "");
  return Math.min(220, Math.max(minW, longest.length * 7 + 16));
}

function cellStyle(bg: string, w: number, h: number = ROW_H) {
  return {
    width: w,
    height: h,
    minWidth: w,
    maxWidth: w,
    minHeight: h,
    maxHeight: h,
    boxSizing: "border-box" as const,
    backgroundColor: bg,
  };
}

function IconUndo() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 14H4V9M4 9l5 5M4 9a8 8 0 1 1 2 3.3" />
    </svg>
  );
}

function ResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      onMouseDown={onMouseDown}
      className="absolute right-0 top-0 z-10 hidden h-full w-1.5 cursor-col-resize hover:bg-[#3390ec]/60 md:block"
      style={{ touchAction: "none" }}
    />
  );
}

export default function TeacherJournalTable({
  data,
  readOnly = false,
  embedded = false,
  hideAddColumn = false,
  onGrade,
  onAddToday,
  columnBusy = false,
  onAddLesson,
  onDeleteDate,
  onDayType,
  onFooterNote,
  onLabDueDate,
  onLabCredited,
  onRedAbsent,
  labOkrOnly = false,
  scalePercent = 100,
  isDark = false,
  onUndo,
  canUndo,
  onStudentClick,
  presencePeers = [],
  onCellFocus,
  menuBackdrop = "blur",
}: TeacherJournalTableProps) {
  const scale = clampJournalScalePercent(scalePercent);
  const cellBg = "var(--app-journal-cell)";
  const headerBg = "var(--app-journal-header)";
  const headerBg2 = "var(--app-journal-month)";
  const rowBg = "var(--app-journal-sticky)";
  const { widths, setWidth, setDateColWidth } = useJournalColumnWidths();
  const scrollRef = useJournalHorizontalWheel<HTMLDivElement>();
  const tableRef = useRef<HTMLTableElement>(null);

  const tableBounds = (): DOMRect | null => {
    const el = scrollRef.current ?? tableRef.current;
    return el ? el.getBoundingClientRect() : null;
  };
  const INDEX_COL = getIndexColWidth(widths);
  const AVG_COL = widths.avgCol;
  const [picker, setPicker] = useState<{
    row: number;
    col: number;
    anchor: DOMRect;
  } | null>(null);
  const [menuBusy, setMenuBusy] = useState(false);
  const [compactNames, setCompactNames] = useState(false);
  const [flashKeys, setFlashKeys] = useState<Set<string>>(new Set());
  const [footerMenu, setFooterMenu] = useState<{ idx: number; anchor: DOMRect } | null>(null);
  const [footerVal, setFooterVal] = useState("");
  const [dayMenu, setDayMenu] = useState<{ idx: number; anchor: DOMRect } | null>(null);
  const [dueDraft, setDueDraft] = useState("");
  const [hover, setHover] = useState<JournalHoverState>(journalHoverClear);
  const noteAutosave = useRef(createAutosaveScheduler());

  useEffect(() => () => noteAutosave.current.cancel(), []);

  const hoverBg = (base: string, rowIdx: number | null, colIdx: number) =>
    journalHoverCellBg(base, rowIdx, colIdx, hover.hoverRow, hover.hoverCol);

  const dateColKeys = useMemo(
    () => data.columns.map((c) => columnKey(c)),
    [data.columns]
  );

  const dateColWidths = useMemo(
    () => dateColKeys.map((k) => Math.max(MIN_DATE_COL, getDateColWidth(widths, k))),
    [dateColKeys, widths]
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const apply = () => setCompactNames(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (embedded || !onUndo) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ" && !e.shiftKey) {
        e.preventDefault();
        onUndo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [embedded, onUndo]);

  const todayBorder = (idx: number) => todayBorderRight(idx, data.todayIndex);

  const headerColBg = (dateIdx: number, defaultBg: string) => {
    if (labOkrOnly && isLabColumnOverdue(data, dateIdx)) return LAB_OVERDUE_BG;
    return defaultBg;
  };

  const gradeCellBg = (dateIdx: number, val: string, defaultBg: string, rowId: number) => {
    if (labOkrOnly) {
      if (isLabColumnOverdue(data, dateIdx)) return LAB_OVERDUE_BG;
    }
    const col = data.columns[dateIdx];
    if (col && presencePeers.length > 0) {
      const hit = presencePeers.find(
        (p) =>
          p.studentId === rowId &&
          p.date === col.date &&
          (p.slot ?? 0) === col.slot
      );
      if (hit) {
        const color = presenceColor(hit.userId);
        return `color-mix(in srgb, ${color} 22%, ${defaultBg})`;
      }
    }
    return defaultBg;
  };

  const formatAvg = (row: TeacherJournalGridData["rows"][0]) => {
    const vals: number[] = [];
    for (const key of Object.keys(row.gradesMatrix)) {
      const cells = row.gradesMatrix[Number(key)];
      if (!cells?.length) continue;
      for (const cell of cells) {
        if (!cell?.value) continue;
        const n = Number(cell.value.replace(",", "."));
        if (Number.isFinite(n) && n >= 0 && n <= 10) vals.push(n);
      }
    }
    if (!vals.length) return "—";
    return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
  };

  const totalAvg = (() => {
    const avgs = data.rows.map(formatAvg).filter((v) => v !== "—").map(Number);
    if (!avgs.length) return null;
    return (avgs.reduce((a, b) => a + b, 0) / avgs.length).toFixed(1);
  })();

  const formatLabProgress = (row: TeacherJournalGridData["rows"][0]) => {
    const labCols = data.dates
      .map((_, i) => i)
      .filter((i) => {
        const t = data.dayTypes[i];
        return t === "lab" || t === "okr";
      });
    const total = labCols.length;
    if (!total) return "—";
    let zach = 0;
    for (const i of labCols) {
      const val = row.gradesMatrix[i]?.[0]?.value?.trim().toLowerCase() ?? "";
      if (val === "зач") zach++;
    }
    return `${zach}/${total}`;
  };

  const nameColWidth = useMemo(() => {
    const labels = data.rows.map((r) =>
      compactNames ? formatStudentShortName(r.name) : r.name
    );
    const est = estimateNameColWidth(labels, compactNames ? 72 : widths.subjectCol);
    const cap = compactNames ? NAME_COL_MAX_MOBILE : 2000;
    const contentW = Math.min(cap, est);
    return Math.max(widths.subjectCol, contentW);
  }, [data.rows, compactNames, widths.subjectCol]);

  const showAddCol = !readOnly && !hideAddColumn;
  const addColW = dateColWidths[0] ?? widths.markCol;

  const tableWidth =
    INDEX_COL +
    nameColWidth +
    dateColWidths.reduce((a, b) => a + b, 0) +
    (showAddCol ? addColW : 0) +
    AVG_COL;

  const flashCell = (rowId: number, col: number) => {
    const key = `${rowId}:${col}`;
    setFlashKeys((s) => new Set(s).add(key));
    window.setTimeout(() => {
      setFlashKeys((s) => {
        const next = new Set(s);
        next.delete(key);
        return next;
      });
    }, 1500);
  };

  const closeMenus = () => {
    setDayMenu(null);
    setPicker(null);
    setFooterMenu(null);
  };

  const runMenuAction = async (action: () => AsyncResult, close = true) => {
    setMenuBusy(true);
    try {
      const result = await action();
      if (result === false) return;
      if (close) closeMenus();
    } finally {
      setMenuBusy(false);
    }
  };

  const pickGrade = async (rowId: number, col: number, value: string, meta?: GradeMeta) => {
    setMenuBusy(true);
    try {
      const finalValue = resolveGradeValue(value, col, data.redAbsent);
      const result = await onGrade(rowId, col, finalValue, () => {}, meta);
      if (result === false) return;
      flashCell(rowId, col);
      closeMenus();
    } finally {
      setMenuBusy(false);
    }
  };

  return (
    <div className={`relative ${isDark ? "text-zinc-100" : ""}`}>
      {!embedded && !readOnly && onUndo ? (
        <div className="mb-2 flex items-center gap-2">
          <button
            type="button"
            disabled={!canUndo}
            onClick={onUndo}
            className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            title="Ctrl+Z"
          >
            <IconUndo />
            Отменить
          </button>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className={`journal-grid-shell app-scroll w-full min-w-0 overflow-x-auto ${embedded ? "" : "rounded-lg border"}`}
        style={scale !== 100 ? ({ zoom: scale / 100 } as CSSProperties) : undefined}
      >
        <table
          ref={tableRef}
          className="border-collapse border text-xs"
          cellSpacing={0}
          cellPadding={0}
          style={{ tableLayout: "fixed", width: tableWidth }}
          onMouseLeave={() => setHover(journalHoverClear)}
        >
          <colgroup>
            <col style={{ width: INDEX_COL }} />
            <col style={{ width: nameColWidth }} />
            {dateColWidths.map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
            {!showAddCol ? null : <col style={{ width: addColW }} />}
            <col style={{ width: AVG_COL }} />
          </colgroup>
          <thead>
            <tr className="border-b" style={{ backgroundColor: headerBg }}>
              <th
                className="journal-grid-header-text relative sticky left-0 z-20 border-r p-0 text-center text-[13px] font-semibold"
                style={cellStyle(headerBg, INDEX_COL)}
              >
                №
                <ResizeHandle
                  onMouseDown={(e) => startColumnResize(e, "indexCol", INDEX_COL, setWidth)}
                />
              </th>
              <th
                className="journal-grid-header-text relative sticky z-20 border-r px-2 py-0 text-left text-[14px] font-semibold leading-tight"
                style={{ left: INDEX_COL, width: nameColWidth, minWidth: nameColWidth, maxWidth: nameColWidth, height: ROW_H, backgroundColor: headerBg }}
              >
                Студент
                <ResizeHandle
                  onMouseDown={(e) => startColumnResize(e, "subjectCol", nameColWidth, setWidth)}
                />
              </th>
              {data.months.map((month, i) => {
                const { start, count } = monthDateRange(i, data.monthColspans);
                const monthKeys = Array.from({ length: count }, (_, j) => dateColKeys[start + j] ?? `idx:${start + j}`);
                const monthWidths = Array.from(
                  { length: count },
                  (_, j) => dateColWidths[start + j] ?? widths.markCol
                );
                return (
                <th
                  key={`${month}-${i}`}
                  colSpan={data.monthColspans[i]}
                  className="journal-grid-header-text relative border-r px-1 py-1 text-center text-[13px] font-semibold"
                  style={{ backgroundColor: headerBg2 }}
                >
                  {month}
                  <ResizeHandle
                    onMouseDown={(e) => startMonthColumnsResize(e, monthKeys, monthWidths, setDateColWidth)}
                  />
                </th>
                );
              })}
              {!showAddCol ? null : (
                <th rowSpan={2} className="border-l border-r align-middle" style={{ backgroundColor: headerBg }}>
                    <button
                    type="button"
                    title="Добавить сегодня"
                    disabled={columnBusy}
                    onClick={onAddToday}
                    className="journal-grid-muted mx-auto flex h-6 w-6 items-center justify-center text-sm font-bold hover:text-[#3390ec] disabled:opacity-40"
                  >
                    {columnBusy ? "…" : "+"}
                  </button>
                </th>
              )}
              <th
                rowSpan={2}
                className="journal-grid-header-text relative border-l p-0 text-center text-[13px] font-semibold leading-tight"
                style={{ width: AVG_COL, minWidth: AVG_COL, maxWidth: AVG_COL, backgroundColor: headerBg }}
              >
                {labOkrOnly ? (
                  <>
                    Сейчас/
                    <br />
                    Всего
                  </>
                ) : (
                  "Ср.зн"
                )}
                <ResizeHandle onMouseDown={(e) => startColumnResize(e, "avgCol", AVG_COL, setWidth)} />
              </th>
            </tr>
            <tr className="border-b" style={{ backgroundColor: headerBg2 }}>
              <td className="sticky left-0 z-20 border-r p-0" style={cellStyle(headerBg, INDEX_COL)} />
              <td
                className="sticky z-20 border-r p-0"
                style={{ left: INDEX_COL, width: nameColWidth, minWidth: nameColWidth, maxWidth: nameColWidth, backgroundColor: headerBg2 }}
              />
              {data.dates.map((date, idx) => {
                const w = dateColWidths[idx] ?? widths.markCol;
                const colKey = dateColKeys[idx] ?? `idx:${idx}`;
                return (
                  <td
                    key={idx}
                    className={`journal-grid-muted relative border-r p-0 text-center align-middle text-[13px] font-medium ${todayBorder(idx)}`}
                    style={cellStyle(headerColBg(idx, hoverBg(headerBg, null, idx)), w, DATE_HEADER_H)}
                  >
                    <button
                      type="button"
                      disabled={readOnly}
                      onMouseEnter={() => setHover(journalHoverFromColumn(idx))}
                      onClick={(e) => {
                        if (readOnly) return;
                        e.stopPropagation();
                        setPicker(null);
                        const el = (e.currentTarget as HTMLElement).closest("td") ?? e.currentTarget;
                        setDayMenu((prev) =>
                          prev?.idx === idx
                            ? null
                            : { idx, anchor: el.getBoundingClientRect() }
                        );
                        setDueDraft(data.labDueDates[idx]?.slice(0, 10) ?? "");
                      }}
                      className="flex h-full min-h-[44px] w-full touch-manipulation items-center justify-center px-0.5 active:bg-[#3390ec]/10"
                    >
                      {date}
                    </button>
                    <ResizeHandle
                      onMouseDown={(e) => startDateColumnResize(e, colKey, w, setDateColWidth)}
                    />
                  </td>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, rowIdx) => (
              <tr key={row.id} className="border-b" style={{ height: ROW_H }}>
                <td
                  className="journal-grid-muted sticky left-0 z-10 border-r p-0 text-center align-middle text-[13px] transition-colors"
                  style={cellStyle(hoverBg(rowBg, rowIdx, -1), INDEX_COL)}
                  onMouseEnter={() => setHover(journalHoverFromCell(rowIdx, -1))}
                >
                  {rowIdx + 1}
                </td>
                <td
                  className={`journal-grid-header-text sticky z-10 border-r px-2 py-0 text-[14px] font-semibold leading-tight whitespace-nowrap overflow-hidden text-ellipsis transition-colors ${
                    onStudentClick ? "cursor-pointer hover:text-[#3390ec]" : ""
                  }`}
                  style={{
                    left: INDEX_COL,
                    width: nameColWidth,
                    minWidth: nameColWidth,
                    maxWidth: nameColWidth,
                    height: ROW_H,
                    backgroundColor: hoverBg(rowBg, rowIdx, -1),
                  }}
                  title={row.name}
                  onClick={() => onStudentClick?.(row.id, row.name)}
                  onMouseEnter={() => setHover(journalHoverFromCell(rowIdx, -1))}
                >
                  {compactNames ? formatStudentShortName(row.name) : row.name}
                </td>
                {data.dates.map((_d, dateIdx) => {
                  const cell = row.gradesMatrix[dateIdx]?.[0];
                  const val = cell?.value ?? "";
                  const w = dateColWidths[dateIdx] ?? widths.markCol;
                  const flashKey = `${row.id}:${dateIdx}`;
                  const flashing = flashKeys.has(flashKey);
                  return (
                    <td
                      key={dateIdx}
                      className={`relative border-r p-0 text-center align-middle leading-none touch-manipulation transition-colors ${todayBorder(dateIdx)} ${readOnly ? "" : "cursor-pointer active:bg-[#3390ec]/10"} ${flashing ? "journal-grade-flash" : ""}`}
                      style={cellStyle(gradeCellBg(dateIdx, val, hoverBg(cellBg, rowIdx, dateIdx), row.id), w)}
                      onMouseEnter={() => {
                        setHover(journalHoverFromCell(rowIdx, dateIdx));
                        onCellFocus?.(row.id, dateIdx);
                      }}
                      onClick={(e) => {
                        if (readOnly) return;
                        e.stopPropagation();
                        setDayMenu(null);
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setPicker({
                          row: rowIdx,
                          col: dateIdx,
                          anchor: rect,
                        });
                      }}
                    >
                      <span className={`text-[13px] ${gradeCellClass(val, labOkrOnly)}`}>
                        {formatGradeMarkDisplay(val)}
                      </span>
                    </td>
                  );
                })}
                {!showAddCol ? null : (
                  <td className="border-l border-r p-0" style={cellStyle(cellBg, addColW)} />
                )}
                <td
                  className="journal-grid-avg border-l p-0 text-center align-middle text-[13px] font-bold leading-tight transition-colors"
                  style={{ width: AVG_COL, minWidth: AVG_COL, maxWidth: AVG_COL, height: ROW_H, backgroundColor: hoverBg(rowBg, rowIdx, data.dates.length) }}
                  onMouseEnter={() => setHover(journalHoverFromCell(rowIdx, data.dates.length))}
                >
                  {labOkrOnly ? formatLabProgress(row) : formatAvg(row)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t" style={{ backgroundColor: headerBg }}>
              <td className="sticky left-0 z-10 p-0" style={cellStyle(headerBg, INDEX_COL)} />
              <td
                className="sticky z-10 p-0"
                style={{ left: INDEX_COL, width: nameColWidth, height: FOOTER_ROW_H, backgroundColor: headerBg }}
              />
              {data.dates.map((_, i) => {
                const w = dateColWidths[i] ?? widths.markCol;
                const note = data.footerNotes[i] ?? "";
                return (
                  <td
                    key={i}
                    className={`journal-grid-muted relative border-r p-0 text-center align-middle ${todayBorder(i)} ${readOnly ? "" : "cursor-pointer"}`}
                    style={{ ...cellStyle(headerColBg(i, hoverBg(headerBg, data.rows.length, i)), w), height: FOOTER_ROW_H }}
                    title={note || undefined}
                    onMouseEnter={() => setHover(journalHoverFromColumn(i))}
                    onClick={(e) => {
                      if (readOnly) return;
                      e.stopPropagation();
                      setPicker(null);
                      setDayMenu(null);
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setFooterMenu({ idx: i, anchor: rect });
                      setFooterVal(note);
                    }}
                  >
                    {note ? (
                      <div className="flex h-full items-center justify-center px-0.5">
                        <span
                          className="journal-grid-muted max-h-[64px] overflow-hidden leading-tight"
                          style={{
                            writingMode: "vertical-rl",
                            transform: "rotate(180deg)",
                            fontSize: FOOTER_FONT_PX,
                          }}
                        >
                          {note}
                        </span>
                      </div>
                    ) : !readOnly ? (
                      <span className="journal-grid-muted text-[10px] opacity-40">+</span>
                    ) : null}
                  </td>
                );
              })}
              {!showAddCol ? null : <td className="p-0" style={cellStyle(headerBg, addColW)} />}
              <td
                className="journal-grid-avg border-l p-0 text-center align-middle text-[9px] font-bold leading-[25px]"
                style={{ width: AVG_COL, height: FOOTER_ROW_H, backgroundColor: headerBg }}
              >
                {labOkrOnly ? "—" : (totalAvg ?? "—")}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {dayMenu !== null && !readOnly ? (
        <JournalAnchorPopover
          anchor={dayMenu.anchor}
          highlightRect={dayMenu.anchor}
          tableBounds={tableBounds()}
          crossHighlight
          backdropMode={menuBackdrop}
          spotlight={{
            backgroundColor: "var(--app-journal-header, #f8fafc)",
            children: (
              <span className="journal-grid-muted px-0.5 text-[13px] font-medium">
                {data.dates[dayMenu.idx]}
              </span>
            ),
          }}
          onClose={closeMenus}
          menuWidth={240}
          progress={menuBusy ? "indeterminate" : "idle"}
        >
          <div className="py-1 text-left text-sm">
            <p className="border-b border-gray-100 px-3 py-2 text-xs font-semibold text-gray-500">
              {formatColumnDateFull(data.dateKeys[dayMenu.idx] ?? "")}
            </p>
            <button
              type="button"
              disabled={menuBusy}
              className="block w-full px-3 py-2.5 text-left hover:bg-gray-50 disabled:opacity-50"
              onClick={() => void runMenuAction(() => onDayType(dayMenu.idx, "lab"))}
            >
              Лаб. работа
            </button>
            <button
              type="button"
              disabled={menuBusy}
              className="block w-full px-3 py-2.5 text-left hover:bg-gray-50 disabled:opacity-50"
              onClick={() => void runMenuAction(() => onDayType(dayMenu.idx, "okr"))}
            >
              ОКР
            </button>
            <button
              type="button"
              disabled={menuBusy}
              className="block w-full px-3 py-2.5 text-left hover:bg-gray-50 disabled:opacity-50"
              onClick={() => void runMenuAction(() => onDayType(dayMenu.idx, "normal"))}
            >
              Обычный
            </button>
            {(data.dayTypes[dayMenu.idx] === "lab" || data.dayTypes[dayMenu.idx] === "okr") && onLabDueDate ? (
              <div className="border-t border-gray-100 px-3 py-2">
                <label className="mb-1 block text-xs text-gray-500">Срок сдачи</label>
                <input
                  type="date"
                  value={dueDraft}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDueDraft(v);
                    if (onLabDueDate) void onLabDueDate(dayMenu.idx, v || null);
                  }}
                  className={`w-full rounded-lg border px-2 py-1.5 text-sm ${
                    isDark
                      ? "border-zinc-600 bg-zinc-800 text-zinc-100 [color-scheme:dark]"
                      : "border-gray-200 bg-white text-gray-900"
                  }`}
                />
              </div>
            ) : null}
            {onLabCredited && (data.dayTypes[dayMenu.idx] === "lab" || data.dayTypes[dayMenu.idx] === "okr") ? (
              <button
                type="button"
                disabled={menuBusy}
                className="block w-full border-t border-gray-100 px-3 py-2.5 text-left text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                onClick={() =>
                  void runMenuAction(() =>
                    onLabCredited?.(dayMenu.idx, !data.labCredited[dayMenu.idx])
                  )
                }
              >
                {data.labCredited[dayMenu.idx] ? "Снять зач." : "Зач."}
              </button>
            ) : null}
            {onRedAbsent ? (
              <button
                type="button"
                disabled={menuBusy}
                className={`block w-full border-t border-gray-100 px-3 py-2.5 text-left disabled:opacity-50 ${
                  data.redAbsent[dayMenu.idx]
                    ? "bg-red-50 font-medium text-red-700 hover:bg-red-100"
                    : "hover:bg-gray-50"
                }`}
                onClick={() =>
                  void runMenuAction(() => onRedAbsent(dayMenu.idx, !data.redAbsent[dayMenu.idx]))
                }
              >
                {data.redAbsent[dayMenu.idx] ? "✓ Красная н" : "Красная н"}
              </button>
            ) : null}
            <button
              type="button"
              disabled={menuBusy}
              className="block w-full border-t border-gray-100 px-3 py-2.5 text-left hover:bg-gray-50 disabled:opacity-50"
              onClick={() => void runMenuAction(() => onAddLesson(dayMenu.idx))}
            >
              Добавить урок
            </button>
            <button
              type="button"
              disabled={menuBusy}
              className="block w-full border-t border-gray-100 px-3 py-2.5 text-left text-red-600 hover:bg-red-50 disabled:opacity-50"
              onClick={() => void runMenuAction(() => onDeleteDate(dayMenu.idx))}
            >
              Удалить колонку
            </button>
          </div>
        </JournalAnchorPopover>
      ) : null}
      {footerMenu !== null && !readOnly ? (
        <JournalAnchorPopover
          anchor={footerMenu.anchor}
          highlightRect={footerMenu.anchor}
          tableBounds={tableBounds()}
          crossHighlight
          backdropMode={menuBackdrop}
          spotlight={{
            backgroundColor: "var(--app-journal-header, #f8fafc)",
            children: data.footerNotes[footerMenu.idx] ? (
              <span className="journal-grid-muted max-h-full overflow-hidden px-0.5 text-[10px] leading-tight">
                {data.footerNotes[footerMenu.idx]}
              </span>
            ) : (
              <span className="journal-grid-muted text-[10px] opacity-40">+</span>
            ),
          }}
          onClose={closeMenus}
          menuWidth={280}
        >
          <div className="p-3">
            <p className="mb-2 text-xs font-semibold text-gray-500">
              Подпись урока · {formatColumnDateFull(data.dateKeys[footerMenu.idx] ?? "")}
            </p>
            <textarea
              autoFocus
              rows={4}
              value={footerVal}
              onChange={(e) => {
                const v = e.target.value;
                setFooterVal(v);
                if (!footerMenu) return;
                const idx = footerMenu.idx;
                noteAutosave.current.schedule(idx, v, () => {
                  void Promise.resolve(onFooterNote(idx, v)).finally(() => {
                    noteAutosave.current.pendingIds.delete(idx);
                  });
                });
              }}
              placeholder="Тема, задание, комментарий…"
              className={`w-full resize-y rounded-lg border px-3 py-2 text-sm outline-none focus:border-[#3390ec] ${
                isDark
                  ? "border-zinc-600 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500"
                  : "border-gray-200 bg-white text-gray-900"
              }`}
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-xs text-gray-400">Сохраняется само</p>
              <button
                type="button"
                disabled={menuBusy}
                className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                onClick={closeMenus}
              >
                Закрыть
              </button>
            </div>
          </div>
        </JournalAnchorPopover>
      ) : null}
      {picker !== null ? (
        <GradePickerPopover
          busy={menuBusy}
          anchor={picker.anchor}
          tableBounds={tableBounds()}
          backdropMode={menuBackdrop}
          current={data.rows[picker.row]?.gradesMatrix[picker.col]?.[0]?.value ?? ""}
          currentClass={gradeCellClass(data.rows[picker.row]?.gradesMatrix[picker.col]?.[0]?.value ?? "", labOkrOnly)}
          gradeId={data.rows[picker.row]?.gradesMatrix[picker.col]?.[0]?.id}
          redAbsent={Boolean(data.redAbsent[picker.col])}
          onPick={(v) => {
            const row = data.rows[picker.row];
            if (row) {
              const cell = row.gradesMatrix[picker.col]?.[0];
              void pickGrade(row.id, picker.col, v, cell?.id ? { gradeId: cell.id } : undefined);
            }
          }}
          onClose={closeMenus}
        />
      ) : null}
      {readOnly && !embedded ? (
        <p className="mt-2 text-xs text-amber-600">Режим куратора — только просмотр</p>
      ) : null}
    </div>
  );
}

function gradeMarkSelected(current: string, mark: (typeof SPECIAL_GRADE_MARKS)[number], redAbsent?: boolean): boolean {
  if (gradeMarkMatches(current, mark)) return true;
  if (redAbsent && mark.red && current.trim().toLowerCase() === "н") return true;
  return false;
}

function GradePickerPopover({
  busy,
  current,
  currentClass,
  gradeId,
  redAbsent,
  anchor,
  tableBounds,
  backdropMode = "blur",
  onPick,
  onClose,
}: {
  busy?: boolean;
  current: string;
  currentClass: string;
  gradeId?: number;
  redAbsent?: boolean;
  anchor: DOMRect;
  tableBounds?: DOMRect | null;
  backdropMode?: JournalMenuBackdrop;
  onPick: (v: string) => void;
  onClose: () => void;
}) {
  const displayCurrent = formatGradeMarkDisplay(current);
  return (
    <JournalAnchorPopover
      anchor={anchor}
      highlightRect={anchor}
      tableBounds={tableBounds}
      crossHighlight
      backdropMode={backdropMode}
      spotlight={{
        backgroundColor: "var(--app-journal-cell, #ffffff)",
        children: displayCurrent ? (
          <span className={`text-[13px] font-semibold leading-none ${currentClass}`}>{displayCurrent}</span>
        ) : (
          <span className="text-[11px] text-gray-300">·</span>
        ),
      }}
      progress={busy ? "indeterminate" : "idle"}
      onClose={onClose}
      menuWidth={248}
    >
      <div className="p-3">
        {displayCurrent ? (
          <p className={`mb-2 text-center text-sm font-semibold ${currentClass}`}>{displayCurrent}</p>
        ) : null}
        <p className="mb-2 text-center text-xs font-medium text-gray-700">Оценка 0–10</p>
        <div className="grid grid-cols-6 gap-1.5">
          {Array.from({ length: 11 }, (_, i) => i).map((n) => (
            <button
              key={n}
              type="button"
              disabled={busy}
              onClick={() => onPick(String(n))}
              className={`min-h-[36px] rounded-lg text-sm font-medium hover:bg-[#3390ec]/10 hover:text-[#3390ec] disabled:opacity-50 ${
                current === String(n) ? "bg-[#3390ec]/15 font-semibold text-[#3390ec]" : ""
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1.5 border-t border-gray-100 pt-3">
          {SPECIAL_GRADE_MARKS.map((mark) => (
            <button
              key={mark.value}
              type="button"
              disabled={busy}
              onClick={() => onPick(mark.value)}
              className={`min-h-[40px] rounded-lg text-sm font-semibold hover:bg-gray-50 disabled:opacity-50 ${
                gradeMarkSelected(current, mark, redAbsent)
                  ? mark.red
                    ? "bg-red-100 text-red-700"
                    : "bg-gray-100 text-gray-900"
                  : mark.red
                    ? "text-red-600"
                    : "text-gray-900"
              }`}
            >
              {mark.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => onPick("")}
          className="mt-3 w-full rounded-lg py-2 text-xs text-gray-400 hover:bg-gray-50 hover:text-red-500 disabled:opacity-50"
        >
          {gradeId ? "Удалить отметку" : "Очистить отметку"}
        </button>
      </div>
    </JournalAnchorPopover>
  );
}
