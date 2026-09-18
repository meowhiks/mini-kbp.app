/** PKCE redirect для Telegram Login — один поток для ПК и телефона. */

import { getPublicLkOrigin } from "@/lib/client/lkAppUrl";
import { isElectronDesktop, isMobileBrowser, isNativeApp } from "@/lib/client/platform";

const VERIFIER_KEY = "tg_oidc_verifier";
const STATE_KEY = "tg_oidc_state";
const REDIRECT_URI_KEY = "tg_oidc_redirect_uri";

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomUrlSafe(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function pkceChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(hash));
}

/** @deprecated Используйте startTelegramOidcRedirect — redirect везде. */
export function shouldUseTelegramRedirect(): boolean {
  if (typeof window === "undefined") return false;
  return isNativeApp() || isMobileBrowser();
}

/** Канонический origin — всегда через getPublicLkOrigin (в APK не localhost). */
export function resolveTelegramOAuthOrigin(): string {
  return getPublicLkOrigin();
}

export function getTelegramOidcRedirectUri(): string {
  if (typeof window !== "undefined") {
    const stored = sessionStorage.getItem(REDIRECT_URI_KEY);
    if (stored) return stored;
  }
  return `${resolveTelegramOAuthOrigin()}/auth/telegram`;
}

export function buildTelegramOidcAuthUrl(
  clientId: string,
  state: string,
  challenge: string,
  redirectUri = `${getPublicLkOrigin()}/auth/telegram`,
  origin = getPublicLkOrigin()
): string {
  const params = new URLSearchParams();
  params.set("client_id", clientId);
  params.set("redirect_uri", redirectUri);
  params.set("response_type", "code");
  params.set("scope", "openid profile");
  params.set("state", state);
  params.set("code_challenge", challenge);
  params.set("code_challenge_method", "S256");
  params.set("origin", origin);
  return `https://oauth.telegram.org/auth?${params.toString()}`;
}

export async function startTelegramOidcRedirectToPath(
  clientId: string,
  path = "/auth/telegram"
): Promise<void> {
  const verifier = randomUrlSafe(32);
  const challenge = await pkceChallenge(verifier);
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const redirectUri = `${resolveTelegramOAuthOrigin()}${normalized}`;
  const electron = isElectronDesktop();
  const state = electron ? encodeTelegramOidcState(verifier) : randomUrlSafe(16);
  if (!electron) {
    sessionStorage.setItem(VERIFIER_KEY, verifier);
    sessionStorage.setItem(STATE_KEY, state);
    sessionStorage.setItem(REDIRECT_URI_KEY, redirectUri);
  }

  const url = buildTelegramOidcAuthUrl(clientId, state, challenge, redirectUri);
  if (electron) {
    const desktop = (window as Window & { minikbpDesktop?: { openExternal?: (next: string) => void } })
      .minikbpDesktop;
    if (desktop?.openExternal) {
      desktop.openExternal(url);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  window.location.assign(url);
}

export async function startTelegramOidcRedirect(clientId: string): Promise<void> {
  await startTelegramOidcRedirectToPath(clientId, "/auth/telegram");
}

/** Custom Tab в приложении: PKCE redirect вместо popup post_message. */
export async function startTelegramMobileOidcRedirect(clientId: string): Promise<void> {
  await startTelegramOidcRedirectToPath(clientId, "/auth/cb");
}

/** Stateless PKCE для Custom Tab — verifier в state, без sessionStorage. */
function base64UrlEncodeString(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecodeString(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = "=".repeat((4 - (padded.length % 4)) % 4);
  return atob(padded + pad);
}

export function encodeTelegramOidcState(verifier: string, linkToken?: string): string {
  const payload: { v: string; l?: string } = { v: verifier };
  const token = (linkToken || "").trim();
  if (token) payload.l = token;
  return base64UrlEncodeString(JSON.stringify(payload));
}

export function decodeTelegramOidcState(state: string): { verifier: string; linkToken?: string } | null {
  try {
    const parsed = JSON.parse(base64UrlDecodeString(state)) as { v?: string; l?: string };
    if (typeof parsed?.v === "string" && parsed.v.length >= 32) {
      return {
        verifier: parsed.v,
        linkToken: typeof parsed.l === "string" && parsed.l.trim() ? parsed.l.trim() : undefined,
      };
    }
  } catch {
    // ignore
  }
  return null;
}

export async function startTelegramMobileOidcRedirectStateless(
  clientId: string,
  callbackPath = "/auth/cb",
  linkToken?: string
): Promise<void> {
  const redirectUri = `${resolveTelegramOAuthOrigin()}${callbackPath.startsWith("/") ? callbackPath : `/${callbackPath}`}`;
  const { authUrl } = await buildTelegramOidcStartUrl(clientId, redirectUri, linkToken);
  window.location.assign(authUrl);
}

/** PKCE URL без редиректа — для native openSecureWindow. */
export async function buildTelegramOidcStartUrl(
  clientId: string,
  redirectUri: string,
  linkToken?: string
): Promise<{ authUrl: string; verifier: string; state: string }> {
  const verifier = randomUrlSafe(32);
  const challenge = await pkceChallenge(verifier);
  const state = encodeTelegramOidcState(verifier, linkToken);
  const authUrl = buildTelegramOidcAuthUrl(clientId, state, challenge, redirectUri);
  return { authUrl, verifier, state };
}

export function consumeTelegramOidcSession(): {
  verifier: string;
  state: string;
  redirectUri: string;
} | null {
  if (typeof sessionStorage === "undefined") return null;
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  const state = sessionStorage.getItem(STATE_KEY);
  const redirectUri = sessionStorage.getItem(REDIRECT_URI_KEY);
  if (!verifier || !state || !redirectUri) return null;
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(REDIRECT_URI_KEY);
  return { verifier, state, redirectUri };
}

/** PKCE из sessionStorage или stateless state (браузер Electron / Chrome). */
export function resolveTelegramOidcLogin(state: string): { verifier: string; redirectUri: string } | null {
  const session = consumeTelegramOidcSession();
  if (session && session.state === state) {
    return { verifier: session.verifier, redirectUri: session.redirectUri };
  }
  const decoded = decodeTelegramOidcState(state);
  if (!decoded) return null;
  return { verifier: decoded.verifier, redirectUri: `${resolveTelegramOAuthOrigin()}/auth/telegram` };
}

export function isMobileGoogleAuth(): boolean {
  if (typeof window === "undefined") return false;
  return isNativeApp() || isMobileBrowser();
}
