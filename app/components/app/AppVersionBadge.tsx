"use client";

import { APP_VERSION, APP_VERSION_STAGE } from "@/lib/client/appVersion";
import { themeIsDark, type AppTheme } from "@/lib/client/appTheme";

type AppVersionBadgeProps = {
  theme: AppTheme;
};

/** Версия приложения в настройках: номер + стадия. */
export default function AppVersionBadge({ theme }: AppVersionBadgeProps) {
  const isDark = themeIsDark(theme);

  return (
    <span
      className={`text-sm tabular-nums ${isDark ? "text-zinc-400" : "text-gray-500"}`}
      aria-label={`Версия ${APP_VERSION}, ${APP_VERSION_STAGE}`}
    >
      {APP_VERSION}
      <span className={isDark ? "text-zinc-600" : "text-gray-300"}> · </span>
      {APP_VERSION_STAGE}
    </span>
  );
}
