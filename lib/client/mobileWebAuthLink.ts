/**
 * Вход через сайт в Custom Tab + polling (токен подтягивается в приложение).
 */

import { persistAuthPayloadFromApi, type AppPendingAuth, type AuthRole, getAppSession } from "@/lib/client/appAuth";
import { loadStaffSession } from "@/lib/client/miniKbpServer";
import { appendExternalOAuthBridgeParams } from "@/lib/client/oauthBridge";
import { isElectronDesktop, isNativeApp } from "@/lib/client/platform";
import { getServerUrl } from "@/lib/client/serverUrl";
import { platformFetch } from "@/lib/client/platformFetch";
import {
  clearMobileWebLinkSession,
  loadMobileWebLinkSession,
  saveMobileWebLinkSession,
} from "@/lib/client/mobileWebLinkSession";

export type MobileWebLinkKind = "google" | "telegram" | "site";

export type MobileWebLinkStart = {
  token: string;
  auth_url: string;
  kind: MobileWebLinkKind;
};

export type MobileWebLinkResult =
  | { ok: true; role: AuthRole }
  | { ok: true; pending: AppPendingAuth }
  | { ok: false; error: string; cancelled?: boolean };

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 300_000;

function baseUrl(): string {
  const url = getServerUrl();
  if (!url) throw new Error("NEXT_PUBLIC_MINIKBP_SERVER_URL не задан");
  return url;
}

export async function startMobileWebLink(
  kind: MobileWebLinkKind
): Promise<{ ok: true; data: MobileWebLinkStart } | { ok: false; error: string }> {
  try {
    const res = await platformFetch(`${baseUrl()}/v0/auth/app/mobile/link/start/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error: typeof body?.detail === "string" ? body.detail : `Ошибка ${res.status}`,
      };
    }
    const token = typeof body?.token === "string" ? body.token : "";
    const auth_url = typeof body?.auth_url === "string" ? body.auth_url : "";
    if (!token || !auth_url) {
      return { ok: false, error: "Сервер вернул неполный ответ" };
    }
    return { ok: true, data: { token, auth_url, kind } };
  } catch {
    return { ok: false, error: "Сервер недоступен" };
  }
}

type DesktopBridge = {
  openExternal?: (url: string) => void;
};

/** Открыть системный браузер (Custom Tab на Android, Chrome на ПК). */
export async function openExternalBrowser(url: string): Promise<void> {
  if (isNativeApp()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
    return;
  }
  if (isElectronDesktop()) {
    const api = (window as Window & { minikbpDesktop?: DesktopBridge }).minikbpDesktop;
    if (typeof api?.openExternal === "function") {
      api.openExternal(url);
      return;
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function closeExternalBrowser(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.close();
  } catch {
    /* вкладка уже закрыта */
  }
}

async function pollMobileWebLinkOnce(
  token: string
): Promise<MobileWebLinkResult | "pending" | "expired"> {
  try {
    const res = await platformFetch(
      `${baseUrl()}/v0/auth/app/mobile/link/poll/?token=${encodeURIComponent(token)}`,
      { headers: { "Content-Type": "application/json" } }
    );
    const body = await res.json().catch(() => ({}));
    if (res.status === 404 || body?.status === "expired") {
      return "expired";
    }
    if (body?.status === "pending") {
      return "pending";
    }
    if (!res.ok) {
      return { ok: false, error: typeof body?.detail === "string" ? body.detail : `Ошибка ${res.status}` };
    }
    const result = await persistAuthPayloadFromApi(body);
    await clearMobileWebLinkSession();
    await closeExternalBrowser();
    if ("role" in result) return { ok: true, role: result.role };
    return { ok: true, pending: result.pending };
  } catch {
    return { ok: false, error: "Сервер недоступен" };
  }
}

export async function waitForMobileWebLink(
  token: string,
  signal?: AbortSignal
): Promise<MobileWebLinkResult> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (signal?.aborted) {
      await closeExternalBrowser();
      return { ok: false, error: "", cancelled: true };
    }
    const r = await pollMobileWebLinkOnce(token);
    if (r === "pending") {
      await new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, POLL_INTERVAL_MS);
        const onAbort = () => {
          window.clearTimeout(timer);
          resolve();
        };
        if (signal) {
          if (signal.aborted) {
            onAbort();
            return;
          }
          signal.addEventListener("abort", onAbort, { once: true });
        }
      });
      continue;
    }
    if (r === "expired") {
      await clearMobileWebLinkSession();
      return { ok: false, error: "Время входа истекло. Нажмите кнопку ещё раз." };
    }
    return r;
  }
  if (signal?.aborted) {
    await closeExternalBrowser();
    return { ok: false, error: "", cancelled: true };
  }
  return {
    ok: false,
    error: "Не дождались подтверждения. Завершите вход и вернитесь в приложение.",
  };
}

/** Wait one frame (or two) so React can paint AuthWaitingScreen before Browser.open. */
export function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== "function") {
      setTimeout(resolve, 32);
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

export async function signInWithMobileWebLink(
  kind: MobileWebLinkKind,
  signal?: AbortSignal,
  opts?: { openBrowser?: boolean }
): Promise<MobileWebLinkResult> {
  if (!isNativeApp() && !isElectronDesktop()) {
    return { ok: false, error: "Доступно только в приложении" };
  }
  if (signal?.aborted) {
    return { ok: false, error: "", cancelled: true };
  }
  const openBrowser = opts?.openBrowser !== false;

  const start = await startMobileWebLink(kind);
  if (!start.ok) return start;
  if (signal?.aborted) {
    return { ok: false, error: "", cancelled: true };
  }

  await saveMobileWebLinkSession({
    token: start.data.token,
    kind: start.data.kind,
    startedAt: Date.now(),
  });

  const authUrl = appendExternalOAuthBridgeParams(start.data.auth_url, {
    electron: isElectronDesktop(),
  });

  if (openBrowser) {
    await openExternalBrowser(authUrl);
  }

  return waitForMobileWebLink(start.data.token, signal);
}

/** Resume an in-flight poll after remount / deep-link return (no second Browser.open). */
export async function resumeMobileWebLinkPoll(signal?: AbortSignal): Promise<MobileWebLinkResult | null> {
  const session = await loadMobileWebLinkSession();
  if (!session) return null;
  return waitForMobileWebLink(session.token, signal);
}

export async function cancelMobileWebLinkFlow(): Promise<void> {
  await clearMobileWebLinkSession();
  await closeExternalBrowser();
}

/** Уже есть сессия на сайте — завершить mobile link без повторного входа. */
export async function completeMobileWebLinkWithSession(
  linkToken: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getAppSession();
  const staff = await loadStaffSession();
  const access = session?.access || staff?.access;
  if (!access) return { ok: false, error: "Нет активной сессии" };
  try {
    const res = await platformFetch(`${baseUrl()}/v0/auth/app/mobile/link/complete/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${access}`,
      },
      body: JSON.stringify({ link_token: linkToken.trim() }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error: typeof body?.detail === "string" ? body.detail : `Ошибка ${res.status}`,
      };
    }
    if (body?.status === "link_complete") return { ok: true };
    return { ok: false, error: "Не удалось связать с приложением" };
  } catch {
    return { ok: false, error: "Сервер недоступен" };
  }
}
