import { useEffect, useMemo, useState } from "react";

export type ColumnFilters = Record<string, string>;

export function useAdminTable<T>(
  rows: T[],
  options: {
    pageSize?: number;
    search?: string;
    matchSearch?: (row: T, q: string) => boolean;
    columnFilters?: ColumnFilters;
    matchColumn?: (row: T, column: string, value: string) => boolean;
    sortCompare?: (a: T, b: T) => number;
  }
) {
  const pageSize = options.pageSize ?? 25;
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    let list = rows;
    const q = (options.search ?? "").trim().toLowerCase();
    if (q && options.matchSearch) {
      list = list.filter((row) => options.matchSearch!(row, q));
    }
    const filters = options.columnFilters ?? {};
    if (options.matchColumn) {
      for (const [col, val] of Object.entries(filters)) {
        const v = val.trim().toLowerCase();
        if (!v) continue;
        list = list.filter((row) => options.matchColumn!(row, col, v));
      }
    }
    if (options.sortCompare) {
      list = [...list].sort(options.sortCompare);
    }
    return list;
  }, [rows, options.search, options.columnFilters, options.matchSearch, options.matchColumn, options.sortCompare]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));

  useEffect(() => {
    setPage((p) => Math.min(p, pageCount));
  }, [pageCount]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  return { filtered, paged, page, setPage, pageCount, pageSize, total: filtered.length };
}

export function formatRemainingTime(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "истёк";
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days} д ${hours} ч`;
  if (hours > 0) return `${hours} ч ${mins} мин`;
  return `${mins} мин`;
}

export function isoToDateInput(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function dateInputToExpiresIso(dateStr: string): string {
  return `${dateStr}T23:59:59`;
}
