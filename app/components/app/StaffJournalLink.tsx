"use client";

import Link from "next/link";
import type { AppTheme } from "@/lib/client/appTheme";
import { themeIsDark } from "@/lib/client/appTheme";

type StaffJournalLinkProps = {
  theme: AppTheme;
};

export default function StaffJournalLink({ theme }: StaffJournalLinkProps) {
  const isDark = themeIsDark(theme);
  const labelPrimary = `text-sm ${isDark ? "text-zinc-100" : "text-gray-900"}`;
  const labelSecondary = `text-sm ${isDark ? "text-zinc-400" : "text-gray-500"}`;

  return (
    <div className={`flex items-center justify-between gap-4 px-4 py-3.5 border-t ${isDark ? "border-zinc-800" : "border-gray-100"}`}>
      <div>
        <div className={labelPrimary}>Журнал персонала</div>
        <div className={labelSecondary}>Преподаватели и администраторы · Python-сервер</div>
      </div>
      <Link
        href="/app"
        className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium ${
          isDark ? "bg-[#3390ec]/15 text-blue-400" : "bg-[#3390ec]/10 text-[#3390ec]"
        }`}
      >
        Войти
      </Link>
    </div>
  );
}
