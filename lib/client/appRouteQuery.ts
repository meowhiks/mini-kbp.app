/** Query маршрута /app: ?page=timetable|settings&sc=<settings category> */

import {
  APP_TAB_SETTINGS,
  APP_TAB_TIMETABLE,
  isAppSettingsScreen,
  type AppSettingsScreen,
} from "@/lib/client/appTabs";

export type AppPageSlug = "settings" | "timetable";

const PAGE_SLUGS = new Set<AppPageSlug>(["settings", "timetable"]);

const TAB_TO_PAGE: Record<number, AppPageSlug> = {
  [APP_TAB_SETTINGS]: "settings",
  [APP_TAB_TIMETABLE]: "timetable",
};

const PAGE_TO_TAB: Record<AppPageSlug, number> = {
  settings: APP_TAB_SETTINGS,
  timetable: APP_TAB_TIMETABLE,
};

export function isAppPageSlug(value: string): value is AppPageSlug {
  return PAGE_SLUGS.has(value as AppPageSlug);
}

export function appPageFromTab(tab: number): AppPageSlug | null {
  return TAB_TO_PAGE[tab] ?? null;
}

export function tabFromAppPage(page: AppPageSlug): number {
  return PAGE_TO_TAB[page];
}

export function parseAppPage(search: URLSearchParams | string): AppPageSlug | null {
  const sp =
    typeof search === "string"
      ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
      : search;
  const raw = (sp.get("page") || "").trim().toLowerCase();
  // Legacy deep links: journal tab → timetable
  if (raw === "journal") return "timetable";
  return isAppPageSlug(raw) ? raw : null;
}

/** Категория настроек из `sc`; `hub` / пусто → null. */
export function parseSettingsCategory(search: URLSearchParams | string): AppSettingsScreen | null {
  const sp =
    typeof search === "string"
      ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
      : search;
  const raw = (sp.get("sc") || "").trim().toLowerCase();
  if (!raw || raw === "hub") return null;
  return isAppSettingsScreen(raw) ? raw : null;
}

export type AppRoutePatch = {
  /** null — удалить page; undefined — не трогать */
  page?: AppPageSlug | null;
  /** null/`hub` — удалить sc; undefined — не трогать */
  sc?: AppSettingsScreen | null;
};

/** Пишет page/sc, сохраняя остальные query (в т.ч. tt_*). */
export function buildAppRouteSearchParams(
  base: URLSearchParams | string,
  patch: AppRoutePatch
): URLSearchParams {
  const next =
    typeof base === "string"
      ? new URLSearchParams(base.startsWith("?") ? base.slice(1) : base)
      : new URLSearchParams(base.toString());

  if (patch.page !== undefined) {
    if (patch.page) next.set("page", patch.page);
    else next.delete("page");
  }

  const pageNow = parseAppPage(next) ?? patch.page ?? null;

  if (patch.sc !== undefined) {
    if (pageNow === "settings" && patch.sc && patch.sc !== "hub") {
      next.set("sc", patch.sc);
    } else {
      next.delete("sc");
    }
  } else if (pageNow !== "settings") {
    next.delete("sc");
  }

  return next;
}

export function appRouteHref(
  pathname: string,
  base: URLSearchParams | string,
  patch: AppRoutePatch
): string {
  const qs = buildAppRouteSearchParams(base, patch).toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
