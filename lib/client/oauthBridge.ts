export type ExternalOAuthBridgeFlags = {
  native: boolean;
  electron: boolean;
};

/** Телефон и Electron: Google/Telegram только в системном браузере + polling JWT. */
export function shouldUseExternalOAuthBridge(flags: ExternalOAuthBridgeFlags): boolean {
  return flags.native || flags.electron;
}

export function appendExternalOAuthBridgeParams(
  authUrl: string,
  opts: { electron: boolean }
): string {
  if (!opts.electron) return authUrl;
  const url = new URL(authUrl);
  url.searchParams.set("bridge", "desktop");
  return url.toString();
}

export function oauthCallbackReturnCopy(bridge: string | null): {
  title: string;
  body: string;
  showDeepLink: boolean;
} {
  if (bridge === "desktop") {
    return {
      title: "Вход подтверждён",
      body: "Можно вернуться в Мини КБиП — вход уже подтянется.",
      showDeepLink: false,
    };
  }
  // Never open done=1 deep links — they transfer no tokens. Poll / code exchange do.
  return {
    title: "Вход подтверждён",
    body: "Вернитесь в приложение — оно уже получило подтверждение.",
    showDeepLink: false,
  };
}

export const OAUTH_BRIDGE_STORAGE_KEY = "minikbp_oauth_bridge";

export function rememberOAuthCallbackBridge(bridge: string | null): void {
  const value = (bridge || "").trim();
  if (!value || typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(OAUTH_BRIDGE_STORAGE_KEY, value);
}

export function resolveOAuthCallbackBridge(searchBridge: string | null): string | null {
  const fromSearch = (searchBridge || "").trim();
  if (fromSearch) return fromSearch;
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage.getItem(OAUTH_BRIDGE_STORAGE_KEY);
}
