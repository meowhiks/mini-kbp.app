/** Загрузка telegram-login.js и OIDC redirect / popup helpers. */

import { getTelegramLoginOrigin } from "@/lib/client/telegramWidgetHost";

export type TelegramLoginCallbackData = {
  id_token?: string;
  user?: Record<string, unknown>;
  error?: string;
};

declare global {
  interface Window {
    Telegram?: {
      Login: {
        auth: (
          options: { client_id: number; scope?: string[]; lang?: string },
          callback: (data: TelegramLoginCallbackData) => void
        ) => void;
      };
    };
  }
}

const TG_SCRIPT = "https://oauth.telegram.org/js/telegram-login.js?5";

let tgScriptLoading: Promise<void> | null = null;

function addOriginToTelegramAuthUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    if (!parsed.hostname.endsWith("oauth.telegram.org")) return raw;
    if (!parsed.searchParams.has("origin")) {
      parsed.searchParams.set("origin", getTelegramLoginOrigin());
    }
    return parsed.toString();
  } catch {
    return raw;
  }
}

let navigationPatched = false;

/** Патч window.open для legacy SDK popup — origin в URL уже добавляет startTelegramOidcRedirect. */
export function ensureTelegramOAuthOriginPatch(): void {
  if (navigationPatched || typeof window === "undefined") return;
  navigationPatched = true;

  try {
    const originalOpen = window.open.bind(window);
    window.open = ((url?: string | URL, target?: string, features?: string) => {
      let nextUrl = url;
      if (typeof url === "string") {
        nextUrl = addOriginToTelegramAuthUrl(url);
      } else if (url instanceof URL) {
        nextUrl = addOriginToTelegramAuthUrl(url.toString());
      }
      return originalOpen(nextUrl, target, features);
    }) as typeof window.open;
  } catch {
    // window.open read-only в некоторых окружениях — OIDC redirect не использует popup
  }
}

export function loadTelegramLoginScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  ensureTelegramOAuthOriginPatch();
  if (window.Telegram?.Login) return Promise.resolve();
  if (tgScriptLoading) return tgScriptLoading;

  tgScriptLoading = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${TG_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Telegram login script failed")), {
        once: true,
      });
      return;
    }
    const script = document.createElement("script");
    script.src = TG_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Telegram login script failed"));
    document.head.appendChild(script);
  });

  return tgScriptLoading;
}

/** Popup OIDC (ПК) — возвращает id_token через callback SDK. */
export async function openTelegramLoginPopup(
  clientId: string,
  onResult: (data: TelegramLoginCallbackData) => void
): Promise<void> {
  ensureTelegramOAuthOriginPatch();
  await loadTelegramLoginScript();
  if (!window.Telegram?.Login) {
    throw new Error("Telegram Login SDK недоступен");
  }
  const id = Number.parseInt(clientId, 10);
  if (!Number.isFinite(id)) {
    throw new Error("Некорректный Telegram Client ID");
  }
  window.Telegram.Login.auth({ client_id: id, scope: ["profile"], lang: "ru" }, onResult);
}
