/**
 * Deep link mobile_bridge + lk.mini-kbp.site OAuth bridge для native.
 */

import {
  type AppPendingAuth,
  type AuthRole,
} from "@/lib/client/appAuth";
import { getPublicLkOrigin } from "@/lib/client/lkAppUrl";
import { isNativeApp } from "@/lib/client/platform";
import { getServerUrl } from "@/lib/client/serverUrl";
import { platformFetch } from "@/lib/client/platformFetch";
import { pickTelegramAuthPayload } from "@/lib/client/telegramAuthPayload";
import { navigateToAppDeepLink, MOBILE_DEEP_LINK_SCHEME } from "@/lib/client/mobileDeepLink";

export { MOBILE_DEEP_LINK_SCHEME };

export type MobileAuthResult =
  | { ok: true; role: AuthRole }
  | { ok: true; pending: AppPendingAuth }
  | { ok: false; error: string };

export function isNativeMobileAuth(): boolean {
  return isNativeApp();
}

export function telegramMobileStartUrl(): string {
  return `${getPublicLkOrigin()}/auth/cb`;
}

function parseDeepLinkPath(url: string): { kind: "telegram" | "google" | "site"; code: string | null } | null {
  const prefix = `${MOBILE_DEEP_LINK_SCHEME}://`;
  if (!url.startsWith(prefix)) return null;
  const rest = url.slice(prefix.length);
  const qIndex = rest.indexOf("?");
  const path = qIndex >= 0 ? rest.slice(0, qIndex) : rest;
  const query = qIndex >= 0 ? rest.slice(qIndex + 1) : "";
  const code = new URLSearchParams(query).get("code");
  if (path.includes("telegram")) return { kind: "telegram", code };
  if (path.includes("google")) return { kind: "google", code };
  if (path.includes("site")) return { kind: "site", code };
  return null;
}

async function exchangeMobileCode(code: string): Promise<MobileAuthResult> {
  const base = getServerUrl();
  if (!base) return { ok: false, error: "NEXT_PUBLIC_MINIKBP_SERVER_URL не задан" };
  try {
    const res = await platformFetch(`${base}/v0/auth/app/mobile/exchange/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim() }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: typeof body?.detail === "string" ? body.detail : `Ошибка ${res.status}` };
    }
    const { persistAuthPayloadFromApi } = await import("@/lib/client/appAuth");
    const result = await persistAuthPayloadFromApi(body);
    if ("role" in result) return { ok: true, role: result.role };
    return { ok: true, pending: result.pending };
  } catch {
    return { ok: false, error: "Сервер недоступен" };
  }
}

async function closeCustomTab(): Promise<void> {
  const { closeExternalBrowser } = await import("@/lib/client/mobileWebAuthLink");
  await closeExternalBrowser();
}

export async function handleMobileDeepLink(url: string): Promise<MobileAuthResult | null> {
  const parsed = parseDeepLinkPath(url);
  if (!parsed?.code) return null;
  await closeCustomTab();
  const result = await exchangeMobileCode(parsed.code);
  if (result.ok) {
    const { clearMobileWebLinkSession } = await import("@/lib/client/mobileWebLinkSession");
    await clearMobileWebLinkSession();
  }
  return result;
}

export function installMobileAuthDeepLinkListener(
  onResult: (result: MobileAuthResult) => void
): () => void {
  if (!isNativeApp()) return () => {};

  const handle = (url: string) => {
    if (!url.startsWith(`${MOBILE_DEEP_LINK_SCHEME}://`)) return;
    void handleMobileDeepLink(url).then((result) => {
      if (result) onResult(result);
    });
  };

  let remove: (() => void) | undefined;

  void import("@capacitor/app")
    .then(async ({ App }) => {
      try {
        const launch = await App.getLaunchUrl();
        if (launch?.url) handle(launch.url);
      } catch {
        // ignore
      }
      return App.addListener("appUrlOpen", (event) => {
        handle(event.url);
      });
    })
    .then((listener) => {
      remove = () => void listener.remove();
    })
    .catch(() => {});

  return () => remove?.();
}

async function requestMobileAuth(
  path: string,
  body: Record<string, unknown>,
  linkToken?: string
): Promise<MobileBridgeResult> {
  const base = getServerUrl();
  if (!base) return null;
  const payload: Record<string, unknown> = { ...body };
  if (linkToken) {
    payload.link_token = linkToken.trim();
  } else {
    payload.mobile_bridge = true;
  }
  const res = await platformFetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Mobile-Bridge": linkToken ? "0" : "1",
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof data?.detail === "string" ? data.detail : null;
    return { status: "error", error: detail || `Ошибка ${res.status}` };
  }
  const mobileCode = typeof data?.mobile_code === "string" ? data.mobile_code : undefined;
  if (data?.status === "link_complete") {
    return { status: "link_complete", mobileCode };
  }
  if (mobileCode) return { status: "mobile_code", mobileCode };
  return { status: "error", error: "Неожиданный ответ сервера" };
}

export type MobileBridgeResult =
  | { status: "link_complete"; mobileCode?: string }
  | { status: "mobile_code"; mobileCode: string }
  | { status: "error"; error: string }
  | null;

export async function finishTelegramMobileOidcBridge(input: {
  code: string;
  state: string;
  verifier: string;
  redirectUri: string;
  linkToken?: string;
}): Promise<MobileBridgeResult> {
  return requestMobileAuth(
    "/v0/auth/app/telegram/",
    {
      code: input.code.trim(),
      code_verifier: input.verifier.trim(),
      redirect_uri: input.redirectUri.trim(),
    },
    input.linkToken
  );
}

function normalizeTelegramBridgePayload(
  payload: Record<string, unknown>
): Record<string, string | number> {
  if (typeof payload.id_token === "string" && payload.id_token.trim()) {
    return { id_token: payload.id_token.trim() };
  }
  return pickTelegramAuthPayload(payload as Record<string, string | number>);
}

export async function finishTelegramMobileBridge(
  payload: Record<string, unknown>,
  linkToken?: string
): Promise<MobileBridgeResult> {
  return requestMobileAuth(
    "/v0/auth/app/telegram/",
    normalizeTelegramBridgePayload(payload),
    linkToken
  );
}

export async function finishGoogleMobileBridge(
  credential: string,
  linkToken?: string
): Promise<MobileBridgeResult> {
  return requestMobileAuth(
    "/v0/auth/app/google/",
    { credential: credential.trim() },
    linkToken
  );
}

export function buildMobileAuthDeepLink(kind: "telegram" | "google" | "site", mobileCode: string): string {
  return `auth/${kind}?code=${encodeURIComponent(mobileCode)}`;
}

export function openMobileAuthReturn(kind: "telegram" | "google" | "site", mobileCode: string): void {
  navigateToAppDeepLink(buildMobileAuthDeepLink(kind, mobileCode));
}
