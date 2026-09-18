"use client";

import type { AppTheme } from "@/lib/client/appTheme";
import { themeIsDark } from "@/lib/client/appTheme";

type AppRefreshIndicatorProps = {
  theme: AppTheme;
  label?: string;
};

export default function AppRefreshIndicator({ theme, label = "Обновление" }: AppRefreshIndicatorProps) {
  const isDark = themeIsDark(theme);
  const isOled = theme === "oled";

  return (
    <div
      className={`shrink-0 px-4 pt-2 pb-1 ${
        isOled ? "bg-black" : isDark ? "bg-[var(--app-bg)]" : "bg-gray-50"
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 pb-2">
        <span
          className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-[var(--app-accent-ring)] border-t-[var(--app-accent)]"
          aria-hidden="true"
        />
        <span className={`text-xs ${isDark ? "text-zinc-400" : "text-gray-500"}`}>{label}</span>
      </div>
      <div
        className={`relative h-[2px] overflow-hidden rounded-full ${
          isOled ? "bg-zinc-900" : isDark ? "bg-zinc-800/80" : "bg-gray-200"
        }`}
      >
        <div className="absolute inset-y-0 w-[40%] animate-[refreshGlow_1.35s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-transparent via-[var(--app-accent)] to-transparent" />
      </div>
    </div>
  );
}
