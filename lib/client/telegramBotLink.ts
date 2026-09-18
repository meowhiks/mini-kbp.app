/**
 * Вход через Telegram-бот: приложение → t.me/bot?start=TOKEN → бот → polling.
 */

import { persistAuthPayloadFromApi, getAppSession, type AppPendingAuth, type AuthRole } from "@/lib/client/appAuth";
import { loadStaffSession } from "@/lib/client/miniKbpServer";
import { getServerUrl } from "@/lib/client/serverUrl";
import { platformFetch } from "@/lib/client/platformFetch";

export type TelegramBotLinkStart = {
  token: string;
  bot_username: string;
  telegram_url: string;
};

export type TelegramBotLinkResult =
  | { ok: true; role: AuthRole }
  | { ok: true; pending: AppPendingAuth }
  | { ok: true; linked: true; telegram_username: string }
  | { ok: false; error: string; cancelled?: boolean };

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 300_000;

function baseUrl(): string {
  const url = getServerUrl();
  if (!url) throw new Error("NEXT_PUBLIC_MINIKBP_SERVER_URL не задан");
  return url;
}

async function authHeaders(): Promise<Record<string, string>> {
  const staff = await loadStaffSession();
  if (staff?.access) return { Authorization: `Bearer ${staff.access}` };
  const app = await getAppSession();
  if (app?.access) return { Authorization: `Bearer ${app.access}` };
  return {};
}

export async function startTelegramBotLink(): Promise<
  { ok: true; data: TelegramBotLinkStart } | { ok: false; error: string }
> {
  try {
    const res = await platformFetch(`${baseUrl()}/v0/auth/app/telegram/link/start/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      credentials: "include",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error: typeof body?.detail === "string" ? body.detail : `Ошибка ${res.status}`,
      };
    }
    const token = typeof body?.token === "string" ? body.token : "";
    const bot_username = typeof body?.bot_username === "string" ? body.bot_username : "";
    const telegram_url = typeof body?.telegram_url === "string" ? body.telegram_url : "";
    if (!token || !bot_username || !telegram_url) {
      return { ok: false, error: "Сервер вернул неполный ответ" };
    }
    return { ok: true, data: { token, bot_username, telegram_url } };
  } catch {
    return { ok: false, error: "Сервер недоступен" };
  }
}

/** Открыть Telegram с /start TOKEN (tg:// → t.me). */
export async function openTelegramBotLink(_botUsername: string, _token: string, httpsUrl: string): Promise<void> {
  const tgScheme = `tg://resolve?domain=${encodeURIComponent(_botUsername)}&start=${encodeURIComponent(_token)}`;

  try {
    const anchor = document.createElement("a");
    anchor.href = tgScheme;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } catch {
    /* ignore */
  }

  await new Promise((r) => window.setTimeout(r, 350));

  try {
    window.location.href = httpsUrl;
  } catch {
    /* ignore */
  }
}

async function pollTelegramBotLinkOnce(token: string): Promise<TelegramBotLinkResult | "pending" | "expired"> {
  try {
    const res = await platformFetch(
      `${baseUrl()}/v0/auth/app/telegram/link/poll/?token=${encodeURIComponent(token)}`,
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
    if (body?.linked === true) {
      return {
        ok: true,
        linked: true,
        telegram_username: typeof body?.telegram_username === "string" ? body.telegram_username : "",
      };
    }
    if (body?.linked === false) {
      return { ok: false, error: typeof body?.detail === "string" ? body.detail : "Не удалось привязать Telegram" };
    }
    const result = await persistAuthPayloadFromApi(body);
    if ("role" in result) return { ok: true, role: result.role };
    return { ok: true, pending: result.pending };
  } catch {
    return { ok: false, error: "Сервер недоступен" };
  }
}

export async function waitForTelegramBotLink(token: string): Promise<TelegramBotLinkResult> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const r = await pollTelegramBotLinkOnce(token);
    if (r === "pending") {
      await new Promise((resolve) => window.setTimeout(resolve, POLL_INTERVAL_MS));
      continue;
    }
    if (r === "expired") {
      return { ok: false, error: "Код устарел. Нажмите «Telegram» ещё раз." };
    }
    return r;
  }
  return {
    ok: false,
    error: "Не дождались подтверждения в Telegram. Откройте бота и нажмите Start.",
  };
}

export async function signInWithTelegramBotLink(): Promise<TelegramBotLinkResult> {
  const start = await startTelegramBotLink();
  if (!start.ok) return start;

  await openTelegramBotLink(start.data.bot_username, start.data.token, start.data.telegram_url);
  return waitForTelegramBotLink(start.data.token);
}
