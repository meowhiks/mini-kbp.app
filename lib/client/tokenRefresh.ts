/**
 * Тихое обновление JWT: refresh (7 д mobile / 30 д web), на native — fallback quick-login.
 */

import { getServerUrl } from "@/lib/client/serverUrl";
import { isNativeApp } from "@/lib/client/platform";
import { platformFetch } from "@/lib/client/platformFetch";

let silentReauthInFlight: Promise<boolean> | null = null;

export function clientKind(): "mobile" | "web" {
  return isNativeApp() ? "mobile" : "web";
}

export function clientKindHeaders(): Record<string, string> {
  const kind = clientKind();
  return { "X-Client-Kind": kind };
}

type TokenBundle = { access: string; refresh: string };

async function loadTokenBundle(): Promise<TokenBundle | null> {
  const { loadStaffSession } = await import("@/lib/client/miniKbpServer");
  const staff = await loadStaffSession();
  if (staff?.access && staff?.refresh) {
    return { access: staff.access, refresh: staff.refresh };
  }

  const { getAppSession } = await import("@/lib/client/appAuth");
  const app = await getAppSession();
  if (app?.access && app?.refresh) {
    return { access: app.access, refresh: app.refresh };
  }

  const { getStudentSession } = await import("@/lib/client/studentApi");
  const student = await getStudentSession();
  if (student?.access && student?.refresh) {
    return { access: student.access, refresh: student.refresh };
  }

  return null;
}

export async function getCurrentAccessToken(): Promise<string | null> {
  const bundle = await loadTokenBundle();
  return bundle?.access ?? null;
}

export async function refreshAccessToken(): Promise<
  { ok: true; access: string; refresh: string } | { ok: false }
> {
  const bundle = await loadTokenBundle();
  if (!bundle?.refresh) return { ok: false };

  const base = getServerUrl();
  if (!base) return { ok: false };

  try {
    const kind = clientKind();
    const res = await platformFetch(`${base.replace(/\/+$/, "")}/v0/auth/refresh/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...clientKindHeaders(),
      },
      body: JSON.stringify({ refresh: bundle.refresh, device_kind: kind }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false };
    const access = typeof body?.access === "string" ? body.access : "";
    const refresh = typeof body?.refresh === "string" ? body.refresh : "";
    if (!access || !refresh) return { ok: false };
    return { ok: true, access, refresh };
  } catch {
    return { ok: false };
  }
}

/** Обновить JWT; на Android/iOS при протухшем refresh — quick-login. */
export async function trySilentReauth(): Promise<boolean> {
  if (silentReauthInFlight) return silentReauthInFlight;

  silentReauthInFlight = (async () => {
    const refreshed = await refreshAccessToken();
    if (refreshed.ok) {
      const { updateAuthTokens } = await import("@/lib/client/appAuth");
      await updateAuthTokens(refreshed.access, refreshed.refresh);
      return true;
    }

    if (isNativeApp()) {
      const { quickLogin } = await import("@/lib/client/appAuth");
      const r = await quickLogin();
      return r.ok;
    }

    return false;
  })();

  try {
    return await silentReauthInFlight;
  } finally {
    silentReauthInFlight = null;
  }
}

/** fetch с Bearer; при 401 — тихий reauth и одна повторная попытка. */
export async function fetchWithAuthRetry(
  url: string,
  options: RequestInit & { token?: string },
  allowRetry = true
): Promise<Response> {
  const { token, ...init } = options;
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const fetchInit: RequestInit = {
    ...init,
    headers,
    credentials: init.credentials ?? "include",
  };

  const res = await platformFetch(url, fetchInit);
  if (res.status !== 401 || !token || !allowRetry) return res;

  if (await trySilentReauth()) {
    const next = await getCurrentAccessToken();
    if (next) {
      return fetchWithAuthRetry(url, { ...options, token: next }, false);
    }
  }

  return res;
}
