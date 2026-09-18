/** Официальная кнопка Telegram OAuth (oauth.telegram.org/js/telegram-login.js). */

import { ensureTelegramOAuthOriginPatch } from "@/lib/client/telegramLoginSdk";

export type MountTelegramOidcButtonOptions = {
  clientId: string;
  onAuth: (data: Record<string, unknown>) => void;
  buttonStyle?: "outlined" | "filled";
  requestAccess?: "write" | "read";
  buttonLabel?: string;
};

const CALLBACK_PREFIX = "__minikbpTgOnAuth_";

export function mountTelegramOidcLoginButton(
  container: HTMLElement,
  options: MountTelegramOidcButtonOptions
): () => void {
  ensureTelegramOAuthOriginPatch();
  container.innerHTML = "";
  const callbackName = `${CALLBACK_PREFIX}${Math.random().toString(36).slice(2)}`;
  const w = window as unknown as Record<string, unknown>;

  w[callbackName] = (result: Record<string, unknown>) => {
    options.onAuth(result);
  };

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://oauth.telegram.org/js/telegram-login.js?5";
  script.setAttribute("data-client-id", options.clientId.trim());
  // SDK: new Function('data', onauth) — параметр называется data, не user
  script.setAttribute("data-onauth", `${callbackName}(data)`);
  script.setAttribute("data-request-access", options.requestAccess ?? "write");

  const button = document.createElement("button");
  button.type = "button";
  button.className = "tg-auth-button";
  button.setAttribute("data-style", options.buttonStyle ?? "outlined");
  button.textContent = options.buttonLabel ?? "Sign In with Telegram";

  container.appendChild(script);
  container.appendChild(button);

  return () => {
    delete w[callbackName];
    container.innerHTML = "";
  };
}

/** @deprecated используйте mountTelegramOidcLoginButton */
export type MountTelegramLoginWidgetOptions = {
  botUsername: string;
  authUrl: string;
  size?: "large" | "medium" | "small";
  clientId?: string;
  onAuth?: (data: Record<string, unknown>) => void;
};

export function mountTelegramLoginWidget(
  container: HTMLElement,
  options: MountTelegramLoginWidgetOptions
): () => void {
  if (options.clientId && options.onAuth) {
    return mountTelegramOidcLoginButton(container, {
      clientId: options.clientId,
      onAuth: options.onAuth,
      buttonLabel: "Войти через Telegram",
      buttonStyle: "outlined",
    });
  }
  container.innerHTML = "";
  return () => {
    container.innerHTML = "";
  };
}

export function getTelegramWidgetEmbedUrl(botUsername: string, origin: string): string {
  const user = encodeURIComponent(botUsername.replace(/^@/, ""));
  return `https://oauth.telegram.org/embed/${user}?origin=${encodeURIComponent(origin)}&size=large&request_access=write`;
}
