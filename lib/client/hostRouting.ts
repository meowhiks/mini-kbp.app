/** Публичные URL без /app и /staff на lk/panel; внутренние маршруты Next остаются прежними. */

const PANEL_ORIGIN = "https://panel.mini-kbp.site";

const PASSTHROUGH_PREFIXES = [
  "/_next",
  "/__nextjs",
  "/__turbopack",
  "/v0",
  "/errors",
  "/auth",
  "/icons",
  "/privacy",
  "/terms",
  "/downloads",
  "/developers",
] as const;

const PASSTHROUGH_EXACT = new Set([
  "/favicon.ico",
  "/manifest.json",
  "/manifest.webmanifest",
  "/robots.txt",
  "/minikbp.svg",
]);

export type RoutingAction =
  | { type: "next" }
  | { type: "rewrite"; pathname: string }
  | { type: "redirect"; pathname: string; search?: string; status: 301 | 302 }
  | { type: "redirect"; url: string; status: 301 | 302 }
  | { type: "forbidden" };

/** Старый /profile → настройки профиля (?page=settings&sc=profile). */
export const PROFILE_SETTINGS_SEARCH = "?page=settings&sc=profile";

function normalizePath(path: string): string {
  const raw = path.split("?")[0] || "/";
  if (raw.length > 1 && raw.endsWith("/")) return raw.slice(0, -1);
  return raw || "/";
}

export function isPassthroughPath(pathname: string): boolean {
  const p = pathname.split("?")[0] || "/";
  if (PASSTHROUGH_EXACT.has(p)) return true;
  if (PASSTHROUGH_PREFIXES.some((pre) => p === pre || p.startsWith(`${pre}/`) || p.startsWith(pre))) {
    return true;
  }
  return /\.(js|css|map|ico|svg|woff2?|apk|png|jpe?g|gif|webp|webmanifest)$/i.test(p);
}

export function toPublicStaffPath(path: string): string {
  const p = normalizePath(path.startsWith("/") ? path : `/${path}`);
  if (p === "/staff") return "/";
  if (p.startsWith("/staff/")) return p.slice("/staff".length) || "/";
  return p;
}

export function toInternalStaffPath(path: string): string {
  const p = normalizePath(path.startsWith("/") ? path : `/${path}`);
  if (p === "/staff" || p.startsWith("/staff/")) return p;
  if (p === "/") return "/staff";
  return `/staff${p}`;
}

export function toPublicLkPath(path: string): string {
  const p = normalizePath(path.startsWith("/") ? path : `/${path}`);
  if (p === "/app") return "/";
  if (p.startsWith("/app/")) return p.slice("/app".length) || "/";
  return p;
}

export function toInternalLkPath(path: string): string {
  const p = normalizePath(path.startsWith("/") ? path : `/${path}`);
  if (p === "/app" || p.startsWith("/app/")) return p;
  if (p === "/") return "/app";
  return `/app${p}`;
}

export function staffPathMatches(pathname: string, internalHref: string): boolean {
  const a = toInternalStaffPath(pathname);
  const b = toInternalStaffPath(internalHref);
  return a === b || a.startsWith(`${b}/`);
}

/** Ссылки панели: на prefix-free URL — без /staff, на localhost — с /staff. */
export function staffNavHref(internalHref: string, pathname: string): string {
  if (pathname.startsWith("/staff")) return internalHref;
  return toPublicStaffPath(internalHref);
}

function isLocalDevHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
}

function isAppHost(host: string): boolean {
  return host === "lk.mini-kbp.site" || host === "panel.mini-kbp.site" || isLocalDevHost(host);
}

function isApexPublicHost(host: string): boolean {
  return host === "mini-kbp.site" || host === "www.mini-kbp.site";
}

function redirectToLk(path: string): RoutingAction {
  const origin = "https://lk.mini-kbp.site";
  return {
    type: "redirect",
    url: path === "/" ? `${origin}/` : `${origin}${path}`,
    status: 301,
  };
}

export function routeRequest(hostname: string, pathname: string): RoutingAction {
  const host = hostname.split(":")[0]?.toLowerCase() || "";
  const path = pathname.split("?")[0] || "/";

  if (isPassthroughPath(path) && (isAppHost(host) || isApexPublicHost(host) || isLocalDevHost(host))) {
    return { type: "next" };
  }

  if (isApexPublicHost(host)) {
    if (path === "/" || isPassthroughPath(path)) return { type: "next" };
    if (path === "/staff" || path.startsWith("/staff/")) {
      const publicPath = toPublicStaffPath(path);
      const origin = PANEL_ORIGIN.replace(/\/+$/, "");
      return {
        type: "redirect",
        url: publicPath === "/" ? `${origin}/` : `${origin}${publicPath}`,
        status: 301,
      };
    }
    return redirectToLk(path);
  }

  if (host && !isAppHost(host)) {
    return redirectToLk(path);
  }

  if (isPassthroughPath(path)) return { type: "next" };

  if (host === "panel.mini-kbp.site") {
    if (path === "/app" || path.startsWith("/app/")) return { type: "forbidden" };
    if (path === "/staff" || path.startsWith("/staff/")) {
      return { type: "redirect", pathname: toPublicStaffPath(path), status: 301 };
    }
    return { type: "rewrite", pathname: toInternalStaffPath(path) };
  }

  if (host === "lk.mini-kbp.site") {
    if (path === "/staff" || path.startsWith("/staff/")) {
      const publicPath = toPublicStaffPath(path);
      const origin = PANEL_ORIGIN.replace(/\/+$/, "");
      return {
        type: "redirect",
        url: publicPath === "/" ? `${origin}/` : `${origin}${publicPath}`,
        status: 301,
      };
    }
    // Avoid /profile ↔ bounce; cabinet UI lives at /journal (not / = auth).
    if (path === "/profile" || path === "/app/profile") {
      return {
        type: "redirect",
        pathname: "/journal",
        search: PROFILE_SETTINGS_SEARCH,
        status: 301,
      };
    }
    if (path === "/app" || path.startsWith("/app/")) {
      return { type: "redirect", pathname: toPublicLkPath(path), status: 301 };
    }
    return { type: "rewrite", pathname: toInternalLkPath(path) };
  }

  if (isLocalDevHost(host) && (path === "/app/profile" || path === "/profile")) {
    return {
      type: "redirect",
      pathname: "/app/journal",
      search: PROFILE_SETTINGS_SEARCH,
      status: 301,
    };
  }

  if ((path === "/staff" || path.startsWith("/staff/")) && !isLocalDevHost(host) && host !== "panel.mini-kbp.site") {
    const publicPath = toPublicStaffPath(path);
    const origin = PANEL_ORIGIN.replace(/\/+$/, "");
    return {
      type: "redirect",
      url: publicPath === "/" ? `${origin}/` : `${origin}${publicPath}`,
      status: 301,
    };
  }

  return { type: "next" };
}
