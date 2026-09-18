/** URL личного кабинета (lk.mini-kbp.site) и связанных хостов. */

import { toInternalLkPath, toInternalStaffPath, toPublicLkPath, toPublicStaffPath } from "@/lib/client/hostRouting";
import { isBundledAppShell } from "@/lib/client/platform";

export const PRODUCTION_HOME_ORIGIN = "https://lk.mini-kbp.site";
export const PRODUCTION_LK_ORIGIN = "https://lk.mini-kbp.site";
export const PRODUCTION_PANEL_ORIGIN = "https://panel.mini-kbp.site";
export const PRODUCTION_API_ORIGIN = "https://api.mini-kbp.site";

export function isApexHost(hostname: string): boolean {
  const host = hostname.split(":")[0]?.toLowerCase() || "";
  if (host.startsWith("lk.") || host.startsWith("panel.") || host.startsWith("api.")) return false;
  return host === "mini-kbp.site" || host === "www.mini-kbp.site" || host === "localhost" || host === "127.0.0.1";
}

function parseOrigin(url: string): string | null {
  const raw = url.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

export function getLkOrigin(): string {
  const env =
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_MINIKBP_SERVER_URL) ||
    (typeof process !== "undefined" && process.env.APP_PUBLIC_URL) ||
    "";
  const fromEnv = parseOrigin(env);
  if (fromEnv && !fromEnv.includes("api.mini-kbp.site")) {
    return fromEnv;
  }
  return PRODUCTION_LK_ORIGIN;
}

export function getPanelOrigin(): string {
  if (typeof window !== "undefined") {
    if (window.location.hostname === "panel.mini-kbp.site") {
      return window.location.origin;
    }
  }
  return PRODUCTION_PANEL_ORIGIN;
}

function joinOrigin(origin: string, path: string, search = ""): string {
  const base = origin.replace(/\/+$/, "");
  const q = !search ? "" : search.startsWith("?") ? search : `?${search}`;
  if (!path || path === "/") return `${base}/${q}`;
  return `${base}${path}${q}`;
}

function splitPathAndSearch(path: string): { pathname: string; search: string } {
  const q = path.indexOf("?");
  if (q < 0) return { pathname: path, search: "" };
  return { pathname: path.slice(0, q), search: path.slice(q) };
}

/** URL страницы панели: на проде без префикса /staff. */
export function getPanelAppUrl(path = "/staff/dashboard"): string {
  const { pathname, search } = splitPathAndSearch(path.startsWith("/") ? path : `/${path}`);
  const internal = pathname.startsWith("/staff") ? pathname : toInternalStaffPath(pathname);
  const publicPath = toPublicStaffPath(internal);

  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (isPanelHost(host)) return `${publicPath}${search}`;
    if (isLocalDevHost(host)) return `${internal}${search}`;
  }
  return joinOrigin(PRODUCTION_PANEL_ORIGIN, publicPath, search);
}

export function isPanelHost(hostname: string): boolean {
  return hostname === "panel.mini-kbp.site";
}

export function isLocalDevHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
}

/** /staff на любом проде, кроме самой панели, уходит на panel.mini-kbp.site. */
export function staffPathShouldGoToPanel(hostname: string): boolean {
  if (!hostname) return false;
  if (isPanelHost(hostname)) return false;
  if (isLocalDevHost(hostname)) return false;
  return true;
}

/**
 * Origin для OAuth / Custom Tab: в приложении и на lk.mini-kbp.site всегда прод,
 * даже если в .env при сборке остался localhost:3000.
 */
export function getPublicLkOrigin(): string {
  if (typeof window !== "undefined") {
    if (isBundledAppShell()) return PRODUCTION_LK_ORIGIN;
    const host = window.location.hostname;
    if (host === "lk.mini-kbp.site") return PRODUCTION_LK_ORIGIN;
    if (host === "panel.mini-kbp.site") return PRODUCTION_PANEL_ORIGIN;
    if (host === "localhost" || host === "127.0.0.1") {
      return window.location.origin;
    }
  }
  const fromEnv = getLkOrigin();
  try {
    const host = new URL(fromEnv).hostname;
    if (host === "localhost" || host === "127.0.0.1") return PRODUCTION_LK_ORIGIN;
  } catch {
    // ignore
  }
  return fromEnv;
}

export function getLkAppUrl(path = "/app"): string {
  const { pathname, search } = splitPathAndSearch(path.startsWith("/") ? path : `/${path}`);
  const internal = pathname.startsWith("/app") ? pathname : toInternalLkPath(pathname);
  const publicPath = toPublicLkPath(internal);

  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "lk.mini-kbp.site") return `${publicPath}${search}`;
    if (isLocalDevHost(host)) return `${window.location.origin}${internal}${search}`;
  }
  return joinOrigin(PRODUCTION_LK_ORIGIN, publicPath, search);
}

/** Вход и регистрация — только lk.mini-kbp.site. */
export function getLkLoginUrl(search = ""): string {
  const q = !search ? "" : search.startsWith("?") ? search : `?${search}`;
  return joinOrigin(PRODUCTION_LK_ORIGIN, "/", q);
}

/** Без сессии на панели — на вход ЛК, не на статическую 403. */
export function unauthenticatedStaffLocation(hostname: string): string {
  const host = hostname.split(":")[0]?.toLowerCase() || "";
  if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") return "/app";
  return getLkLoginUrl();
}

export function isLkHost(hostname: string): boolean {
  if (isLocalDevHost(hostname)) return true;
  const lk = parseOrigin(getLkOrigin());
  if (!lk) return hostname === "lk.mini-kbp.site";
  try {
    return new URL(lk).hostname === hostname;
  } catch {
    return hostname === "lk.mini-kbp.site";
  }
}
