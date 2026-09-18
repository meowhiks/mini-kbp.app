/** Сброс локального состояния Telegram OAuth между входами. */

const TG_OIDC_KEYS = ["tg_oidc_verifier", "tg_oidc_state", "tg_oidc_redirect_uri"] as const;

export function clearTelegramOAuthSession(): void {
  if (typeof window === "undefined") return;

  for (const key of TG_OIDC_KEYS) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}
