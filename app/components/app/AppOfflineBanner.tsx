"use client";

import { themeIsDark, type AppTheme } from "@/lib/client/appTheme";

type AppOfflineBannerProps = {
  theme: AppTheme;
  visible: boolean;
  message?: string;
};

/** Всплывающее уведомление «вне сети» — не сдвигает контент страницы. */
export default function AppOfflineBanner({
  theme,
  visible,
  message = "Вы вне сети",
}: AppOfflineBannerProps) {
  if (!visible) return null;
  const isDark = themeIsDark(theme);
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-4"
      style={{ bottom: "calc(3.75rem + env(safe-area-inset-bottom))" }}
      role="status"
      aria-live="polite"
    >
      <div
        className={`pointer-events-auto flex max-w-sm items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium shadow-lg backdrop-blur-md ${
          isDark
            ? "border-amber-800/60 bg-amber-950/90 text-amber-100"
            : "border-amber-200/80 bg-white/95 text-amber-900"
        }`}
      >
        <span
          className={`inline-block h-2 w-2 shrink-0 rounded-full ${isDark ? "bg-amber-400" : "bg-amber-500"}`}
          aria-hidden
        />
        {message}
      </div>
    </div>
  );
}
