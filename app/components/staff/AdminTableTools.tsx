"use client";

import { adminBtnOutline, adminInput } from "./AdminShell";
import type { ColumnFilters } from "@/lib/client/adminTable";

export function AdminTablePager({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  if (total <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-3 py-2 text-sm text-gray-600">
      <span>
        {from}–{to} из {total}
      </span>
      <div className="flex items-center gap-1">
        <button type="button" className={adminBtnOutline} disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          ←
        </button>
        <span className="px-2 tabular-nums">
          {page} / {pageCount}
        </span>
        <button
          type="button"
          className={adminBtnOutline}
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          →
        </button>
      </div>
    </div>
  );
}

export function AdminColumnFilters({
  columns,
  filters,
  onChange,
  leadingCols = 0,
  trailingCols = 0,
}: {
  columns: { key: string; label: string; placeholder?: string }[];
  filters: ColumnFilters;
  onChange: (next: ColumnFilters) => void;
  leadingCols?: number;
  trailingCols?: number;
}) {
  return (
    <tr className="border-b border-gray-100 bg-white">
      {Array.from({ length: leadingCols }).map((_, i) => (
        <th key={`lead-${i}`} className="px-2 py-1" />
      ))}
      {columns.map((col) => (
        <th key={col.key} className="px-2 py-1 font-normal">
          <input
            type="search"
            value={filters[col.key] ?? ""}
            onChange={(e) => onChange({ ...filters, [col.key]: e.target.value })}
            placeholder={col.placeholder ?? col.label}
            className={`${adminInput} text-xs`}
          />
        </th>
      ))}
      {Array.from({ length: trailingCols }).map((_, i) => (
        <th key={`trail-${i}`} className="px-2 py-1" />
      ))}
    </tr>
  );
}
