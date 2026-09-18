/**
 * Custom Tab / системный браузер: не используем сессию основного приложения.
 * Callback-страницы stateless — только query + mobile_code → deep link.
 */

const APP_STORAGE_KEYS = [
  "app_session_v1",
  "app_auth_pending_v1",
  "student_session_v1",
  "minikbp_staff_session_v1",
  "app_redirect_v1",
  "app_referral_v1",
  "journal_column_widths_v1",
  "tg_oidc_verifier",
  "tg_oidc_state",
  "tg_oidc_redirect_uri",
] as const;

export function isolateAuthCallbackContext(): void {
  if (typeof window === "undefined") return;

  for (const key of APP_STORAGE_KEYS) {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
  }

  try {
    const cookies = document.cookie.split(";");
    for (const part of cookies) {
      const name = part.split("=")[0]?.trim();
      if (!name) continue;
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${window.location.hostname}`;
    }
  } catch {
    // ignore
  }
}
