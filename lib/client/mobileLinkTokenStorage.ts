/** Сохраняем link_token между шагами входа (verify_email, curator и т.д.). */

const STORAGE_KEY = "mobile_web_link_token_v1";

export function storeMobileLinkToken(token: string): void {
  const value = token.trim();
  if (!value || typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
}

export function getStoredMobileLinkToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return (sessionStorage.getItem(STORAGE_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function clearStoredMobileLinkToken(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function resolveMobileLinkToken(fromUrl: string): string {
  const urlToken = (fromUrl || "").trim();
  if (urlToken) {
    storeMobileLinkToken(urlToken);
    return urlToken;
  }
  return getStoredMobileLinkToken();
}
