"use client";

import type { ReactNode } from "react";

export function appInputClass(isDark: boolean): string {
  return `w-full min-w-0 overflow-hidden text-ellipsis rounded-xl border-0 py-3.5 pl-11 pr-4 text-[15px] outline-none transition focus:ring-2 focus:ring-[var(--app-accent-ring)] ${
    isDark
      ? "bg-zinc-800 text-zinc-100 placeholder:text-zinc-500"
      : "bg-[#f0f0f0] text-gray-900 placeholder:text-gray-400"
  }`;
}

export function appInputClassPlain(isDark: boolean): string {
  return `w-full min-w-0 overflow-hidden text-ellipsis rounded-xl border-0 px-4 py-3.5 text-[15px] outline-none transition focus:ring-2 focus:ring-[var(--app-accent-ring)] ${
    isDark
      ? "bg-zinc-800 text-zinc-100 placeholder:text-zinc-500"
      : "bg-[#f0f0f0] text-gray-900 placeholder:text-gray-400"
  }`;
}

export function AppInputField({
  icon,
  children,
}: {
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative min-w-0 rounded-xl">
      {icon ? <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2">{icon}</div> : null}
      {children}
    </div>
  );
}
