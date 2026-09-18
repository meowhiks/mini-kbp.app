import { storageGet } from "@/lib/client/storage";
import { syncNativeSystemBars } from "@/lib/client/nativeSystemBars";

export type AppTheme = "light" | "dark" | "oled";

export function themeIsDark(theme: AppTheme): boolean {
  return theme === "dark" || theme === "oled";
}

export function parseStoredAppTheme(raw: string | null | undefined): AppTheme | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as { theme?: string; isDark?: boolean };
    if (s.theme === "light" || s.theme === "dark" || s.theme === "oled") return s.theme;
    if (s.isDark) return "dark";
  } catch {}
  return null;
}

export async function loadStoredAppTheme(): Promise<AppTheme> {
  if (typeof window === "undefined") return "light";
  const parsed = parseStoredAppTheme(await storageGet("app_settings_v1"));
  return parsed ?? "light";
}

export function applyAppThemeToDocument(theme: AppTheme): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme !== "light");
  document.documentElement.classList.toggle("theme-oled", theme === "oled");
  void syncNativeSystemBars(theme);
}

/** Фон скролл-страниц */
export function themePageBg(theme: AppTheme): string {
  if (theme === "light") return "bg-white";
  if (theme === "oled") return "bg-black";
  return "bg-[var(--app-bg)]";
}

/** Корневой контейнер приложения */
export function themeAppShell(theme: AppTheme): string {
  if (theme === "light") return "bg-white text-gray-900";
  if (theme === "oled") return "bg-black text-zinc-100";
  return "bg-[var(--app-bg)] text-zinc-100";
}

/** Рамка на десктопе */
export function themeDesktopFrame(theme: AppTheme): string {
  if (theme === "light") return "md:border-gray-200 md:bg-white";
  if (theme === "oled") return "md:border-zinc-900 md:bg-black";
  return "md:border-[var(--app-border)] md:bg-[var(--app-surface)]";
}

/** Нижняя / верхняя навигация */
export function themeNavBar(theme: AppTheme): string {
  if (theme === "light") return "border-gray-200 bg-white";
  if (theme === "oled") return "border-zinc-900 bg-black";
  return "border-[var(--app-border)] bg-[var(--app-surface)]";
}

export function themeNavBarStyle(theme: AppTheme): { backgroundColor: string } {
  if (theme === "light") return { backgroundColor: "#ffffff" };
  if (theme === "oled") return { backgroundColor: "#000000" };
  return { backgroundColor: "var(--app-surface)" };
}

/** Активная вкладка — только цвет иконки/текста, без подложки */
export function themeNavActive(theme: AppTheme): string {
  return "text-[var(--app-accent)] font-semibold";
}

/** Карточка профиля */
export function themeProfileSection(theme: AppTheme): string {
  if (theme === "light") return "rounded-2xl bg-white/90 p-5 transition-colors duration-200";
  if (theme === "oled") return "rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 transition-colors duration-200";
  return "rounded-2xl border border-[var(--app-border)] bg-[var(--app-elevated)]/60 p-5 transition-colors duration-200";
}

/** Поле ввода профиля */
export function themeProfileInput(theme: AppTheme): string {
  const base =
    "w-full rounded-xl border px-4 py-3.5 text-[15px] outline-none transition-colors duration-200 focus:border-[color-mix(in_srgb,var(--app-accent)_40%,transparent)] focus:ring-2 focus:ring-[var(--app-accent-ring)]";
  if (theme === "light") {
    return `${base} border-transparent bg-[#f0f0f0] text-gray-900 placeholder:text-gray-400`;
  }
  if (theme === "oled") {
    return `${base} border-white/[0.06] bg-white/[0.04] text-zinc-100 placeholder:text-zinc-600`;
  }
  return `${base} border-[var(--app-border)] bg-[var(--app-surface)] text-zinc-100 placeholder:text-zinc-500`;
}

/** Вложенная плитка (сеансы и т.п.) */
export function themeProfileTile(theme: AppTheme): string {
  if (theme === "light") return "rounded-2xl bg-[#f0f0f0] transition-colors duration-200";
  if (theme === "oled") return "rounded-2xl bg-white/[0.04] transition-colors duration-200 hover:bg-white/[0.06]";
  return "rounded-2xl bg-[var(--app-surface)] transition-colors duration-200 hover:bg-[var(--app-elevated)]";
}

/** Оболочка input+button */
export function themeProfileInputShell(theme: AppTheme): string {
  if (theme === "light") return "bg-[#f0f0f0]";
  if (theme === "oled") return "border border-white/[0.06] bg-white/[0.04]";
  return "border border-[var(--app-border)] bg-[var(--app-surface)]";
}
