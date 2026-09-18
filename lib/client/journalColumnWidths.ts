"use client";

import { useCallback, useEffect, useState } from "react";
import { storageGet, storageSet } from "@/lib/client/storage";
import {
  STUDENT_AVG_COL_PX,
  STUDENT_MARK_CELL_W,
  STUDENT_SUBJECT_COL_PX,
} from "@/lib/client/journalGridData";

const STORAGE_KEY = "journal_column_widths_v1";

export type JournalColumnWidths = {
  subjectCol: number;
  avgCol: number;
  markCol: number;
  /** Ширина колонки № (если не задана — markCol) */
  indexCol?: number;
  /** Индивидуальная ширина колонок дат: ключ `YYYY-MM-DD:slot` или `idx:N` */
  dateCols?: Record<string, number>;
};

export const DEFAULT_JOURNAL_COLUMN_WIDTHS: JournalColumnWidths = {
  subjectCol: STUDENT_SUBJECT_COL_PX,
  avgCol: STUDENT_AVG_COL_PX,
  markCol: STUDENT_MARK_CELL_W,
};

const MIN = { subjectCol: 64, avgCol: 28, markCol: 18, indexCol: 18 };
const MAX = { subjectCol: 2000, avgCol: 400, markCol: 2000, indexCol: 400 };

function clampScalar(key: keyof typeof MIN, v: number): number {
  return Math.min(MAX[key], Math.max(MIN[key], Math.round(v)));
}

function clampFixed(key: "subjectCol" | "avgCol" | "markCol", v: number): number {
  return clampScalar(key, v);
}

export function getIndexColWidth(widths: JournalColumnWidths): number {
  return clampScalar("indexCol", widths.indexCol ?? widths.markCol);
}

export function getDateColWidth(widths: JournalColumnWidths, colKey: string): number {
  const custom = widths.dateCols?.[colKey];
  return clampScalar("markCol", custom ?? widths.markCol);
}

export function dateColKeyFromIndex(idx: number, dateKey?: string): string {
  if (dateKey) return dateKey;
  return `idx:${idx}`;
}

export function useJournalColumnWidths() {
  const [widths, setWidths] = useState<JournalColumnWidths>(DEFAULT_JOURNAL_COLUMN_WIDTHS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      const raw = await storageGet(STORAGE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<JournalColumnWidths>;
          setWidths({
            subjectCol: clampFixed("subjectCol", Number(parsed.subjectCol) || DEFAULT_JOURNAL_COLUMN_WIDTHS.subjectCol),
            avgCol: clampFixed("avgCol", Number(parsed.avgCol) || DEFAULT_JOURNAL_COLUMN_WIDTHS.avgCol),
            markCol: clampFixed("markCol", Number(parsed.markCol) || DEFAULT_JOURNAL_COLUMN_WIDTHS.markCol),
            indexCol: parsed.indexCol != null ? clampScalar("indexCol", Number(parsed.indexCol)) : undefined,
            dateCols: parsed.dateCols && typeof parsed.dateCols === "object" ? parsed.dateCols : undefined,
          });
        } catch {}
      }
      setHydrated(true);
    })();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void storageSet(STORAGE_KEY, JSON.stringify(widths));
  }, [widths, hydrated]);

  const setWidth = useCallback((key: "subjectCol" | "avgCol" | "markCol" | "indexCol", value: number) => {
    setWidths((prev) => ({ ...prev, [key]: clampScalar(key === "indexCol" ? "indexCol" : key, value) }));
  }, []);

  const setDateColWidth = useCallback((colKey: string, value: number) => {
    setWidths((prev) => ({
      ...prev,
      dateCols: { ...(prev.dateCols ?? {}), [colKey]: clampScalar("markCol", value) },
    }));
  }, []);

  const resetWidths = useCallback(() => {
    setWidths({ ...DEFAULT_JOURNAL_COLUMN_WIDTHS });
  }, []);

  const isCustom =
    widths.subjectCol !== DEFAULT_JOURNAL_COLUMN_WIDTHS.subjectCol ||
    widths.avgCol !== DEFAULT_JOURNAL_COLUMN_WIDTHS.avgCol ||
    widths.markCol !== DEFAULT_JOURNAL_COLUMN_WIDTHS.markCol ||
    widths.indexCol != null ||
    Boolean(widths.dateCols && Object.keys(widths.dateCols).length > 0);

  return { widths, setWidth, setDateColWidth, resetWidths, isCustom, hydrated };
}

/** Drag handle for fixed column resize */
export function startColumnResize(
  e: React.MouseEvent | React.PointerEvent,
  key: "subjectCol" | "avgCol" | "markCol" | "indexCol",
  current: number,
  setWidth: (key: "subjectCol" | "avgCol" | "markCol" | "indexCol", value: number) => void
) {
  e.preventDefault();
  e.stopPropagation();
  const startX = "clientX" in e ? e.clientX : 0;
  const startW = current;

  const onMove = (ev: MouseEvent) => {
    setWidth(key, startW + (ev.clientX - startX));
  };
  const onUp = () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}

/** Drag handle: все колонки месяца одной ширины */
export function startMonthColumnsResize(
  e: React.MouseEvent | React.PointerEvent,
  colKeys: string[],
  currentWidths: number[],
  setDateColWidth: (colKey: string, value: number) => void
) {
  e.preventDefault();
  e.stopPropagation();
  const startX = "clientX" in e ? e.clientX : 0;
  const startTotal = currentWidths.reduce((a, b) => a + b, 0);
  const count = colKeys.length;
  if (!count) return;

  const onMove = (ev: MouseEvent) => {
    const delta = ev.clientX - startX;
    const equalW = (startTotal + delta) / count;
    for (const key of colKeys) {
      setDateColWidth(key, equalW);
    }
  };
  const onUp = () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}

/** Drag handle for per-date column resize */
export function startDateColumnResize(
  e: React.MouseEvent | React.PointerEvent,
  colKey: string,
  current: number,
  setDateColWidth: (colKey: string, value: number) => void
) {
  e.preventDefault();
  e.stopPropagation();
  const startX = "clientX" in e ? e.clientX : 0;
  const startW = current;

  const onMove = (ev: MouseEvent) => {
    setDateColWidth(colKey, startW + (ev.clientX - startX));
  };
  const onUp = () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}
