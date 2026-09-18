"use client";

import type { AppTheme } from "@/lib/client/appTheme";
import { themeIsDark } from "@/lib/client/appTheme";

interface LoadingScreenProps {
  message?: string;
  theme?: AppTheme;
}

export default function LoadingScreen({ message, theme = "light" }: LoadingScreenProps) {
  const isDark = themeIsDark(theme);
  const isOled = theme === "oled";

  return (
    <div
      className={`flex min-h-screen flex-col items-center justify-center px-6 ${
        isOled ? "bg-black" : isDark ? "bg-[var(--app-bg)]" : "bg-white"
      }`}
    >
      <div className="opacity-0 animate-[fadeIn_220ms_ease-out_forwards]">
        <div className={`text-2xl font-bold ${isDark ? "text-zinc-100" : "text-gray-900"}`}>Мини КБиП</div>
      </div>

      {message ? (
        <div className={`mt-6 text-sm ${isDark ? "text-zinc-400" : "text-gray-500"}`}>{message}</div>
      ) : null}

      <div className="mt-10 flex items-center gap-1.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 rounded-full bg-[#3390ec] animate-[loadingDot_1s_ease-in-out_infinite]"
            style={{ animationDelay: `${i * 160}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
