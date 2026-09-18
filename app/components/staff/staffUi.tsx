"use client";

export const staffInput =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#3390ec] focus:ring-1 focus:ring-[#3390ec]/30";

export const staffBtnPrimary =
  "rounded-lg bg-[#3390ec] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#2d7fd6] disabled:opacity-50";

export const staffBtnSecondary =
  "rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50";

export const staffBtnDanger =
  "rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-600 transition hover:bg-red-100";

export function StaffPageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-gray-500">{subtitle}</p> : null}
    </div>
  );
}

export function StaffCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white ${className}`}>{children}</div>
  );
}

export function StaffAlert({ error }: { error: string }) {
  if (!error) return null;
  return <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>;
}

export function StaffTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}
