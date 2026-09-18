"use client";

import type { AppTheme } from "@/lib/client/appTheme";
import { themeIsDark } from "@/lib/client/appTheme";

type Props = {
  theme?: AppTheme;
  onBack: () => void;
};

/** Полноэкранное ожидание внешнего OAuth: только спиннер и «Назад». */
export default function AuthWaitingScreen({ theme = "light", onBack }: Props) {
  const isDark = themeIsDark(theme);
  const isOled = theme === "oled";

  return (
    <div
      className={`safe-top relative flex min-h-dvh flex-col ${
        isOled ? "bg-black" : isDark ? "bg-[var(--app-bg)]" : "bg-white"
      }`}
    >
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div
          className={`h-11 w-11 animate-spin rounded-full border-[3px] border-t-transparent ${
            isDark ? "border-zinc-600 border-t-transparent" : "border-gray-200"
          }`}
          style={{ borderTopColor: "var(--app-accent)" }}
          aria-hidden
        />
      </div>
      <div className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">
        <button
          type="button"
          onClick={onBack}
          className={`mx-auto block w-full max-w-sm rounded-2xl border px-4 py-3.5 text-sm font-medium transition ${
            isDark
              ? "border-zinc-700 text-zinc-200 hover:bg-zinc-900"
              : "border-gray-200 text-gray-700 hover:bg-gray-50"
          }`}
        >
          Назад
        </button>
      </div>
    </div>
  );
}
