/** Вкладки главного экрана /app (pager / absolute overlays). */
export const APP_TAB_SETTINGS = 0;
export const APP_TAB_TIMETABLE = 1;
/** @deprecated Журнал убран; deep link / storeAppTab мапят на расписание. */
export const APP_TAB_JOURNAL = 2;
/** @deprecated Профиль открывается внутри Настроек; значение оставлено для старых deep link. */
export const APP_TAB_PROFILE = 3;
export const APP_TAB_COUNT = 2;

/** Ширина одной панели во flex-карусели. */
export const APP_TAB_PANEL_WIDTH = `${100 / APP_TAB_COUNT}%`;

export const APP_TAB_STORAGE_KEY = "app_journal_tab";
export const APP_SETTINGS_SCREEN_KEY = "app_settings_screen";

export type AppSettingsScreen =
  | "hub"
  | "profile"
  | "security"
  | "notifications"
  | "appearance"
  | "clear";

const SETTINGS_SCREENS: ReadonlySet<string> = new Set([
  "hub",
  "profile",
  "security",
  "notifications",
  "appearance",
  "clear",
]);

export function isAppTabId(value: number): value is 0 | 1 {
  return value >= 0 && value < APP_TAB_COUNT;
}

/** Открыть вкладку приложения (для ссылок с /staff и т.п.). */
export function storeAppTab(tab: number): void {
  let resolved = tab;
  if (tab === APP_TAB_PROFILE) resolved = APP_TAB_SETTINGS;
  else if (tab === APP_TAB_JOURNAL) resolved = APP_TAB_TIMETABLE;
  if (!isAppTabId(resolved)) return;
  try {
    sessionStorage.setItem(APP_TAB_STORAGE_KEY, String(resolved));
  } catch {}
}

export function isAppSettingsScreen(value: string): value is AppSettingsScreen {
  return SETTINGS_SCREENS.has(value);
}

export function storeAppSettingsScreen(screen: AppSettingsScreen): void {
  try {
    sessionStorage.setItem(APP_SETTINGS_SCREEN_KEY, screen);
  } catch {}
}

/** Прочитать и сразу сбросить экран настроек (deep link). */
export function consumeAppSettingsScreen(): AppSettingsScreen | null {
  try {
    const raw = sessionStorage.getItem(APP_SETTINGS_SCREEN_KEY);
    sessionStorage.removeItem(APP_SETTINGS_SCREEN_KEY);
    if (raw && isAppSettingsScreen(raw)) return raw;
  } catch {}
  return null;
}
