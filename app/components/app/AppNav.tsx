"use client";

import type { AppTheme } from "@/lib/client/appTheme";
import { themeIsDark, themeNavBar, themeNavBarStyle } from "@/lib/client/appTheme";
import { appNavItems, type AppNavItem } from "@/lib/client/appNavItems";
import { isNativeApp } from "@/lib/client/platform";

type TabIconName = AppNavItem["icon"];

function TabIcon({ name, active, theme }: { name: TabIconName; active: boolean; theme: AppTheme }) {
  const accent = "text-[var(--app-accent)]";
  const cls = `h-5 w-5 shrink-0 transition-colors ${active ? accent : "currentColor"}`;
  const stroke = active ? 2.25 : 1.75;
  switch (name) {
    case "settings":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case "calendar":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case "journal":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case "profile":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      );
    case "panel":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 13a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6z" />
        </svg>
      );
  }
}

type AppNavProps = {
  currentPage: number;
  onNavigate: (id: number) => void;
  theme: AppTheme;
  staffRole?: string | null;
  guestMode?: boolean;
  onOpenAdminPanel?: () => void;
};

function navButtonClass(active: boolean, theme: AppTheme): string {
  const isDark = themeIsDark(theme);
  const accent = "text-[var(--app-accent)]";
  const base =
    "flex flex-1 flex-col items-center justify-center gap-0.5 min-h-[52px] px-1 text-[11px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--app-accent-ring)]";
  if (active) {
    return `${base} font-semibold ${accent}`;
  }
  return `${base} font-medium ${isDark ? "text-[var(--app-muted)] hover:text-zinc-200" : "text-gray-400 hover:text-gray-600"}`;
}

/** Единая нижняя навигация — телефон, веб-телефон и ПК. */
export default function AppNav({ currentPage, onNavigate, theme, staffRole, guestMode, onOpenAdminPanel }: AppNavProps) {
  const items = appNavItems(staffRole, { hideAdminPanel: isNativeApp(), guestMode });
  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 z-50 border-t safe-px pb-[env(safe-area-inset-bottom)] ${themeNavBar(theme)}`}
      style={themeNavBarStyle(theme)}
    >
      <div className="mx-auto flex w-full max-w-3xl items-stretch justify-around px-1 py-1">
        {items.map((item) => {
          if (item.kind === "panel") {
            return (
              <button
                key="admin-panel"
                type="button"
                onClick={() => onOpenAdminPanel?.()}
                className={navButtonClass(false, theme)}
              >
                <TabIcon name={item.icon} active={false} theme={theme} />
                <span className="max-w-[5.5rem] text-center leading-tight">{item.label}</span>
              </button>
            );
          }
          const active = currentPage === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={navButtonClass(active, theme)}
              aria-current={active ? "page" : undefined}
            >
              <TabIcon name={item.icon} active={active} theme={theme} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
