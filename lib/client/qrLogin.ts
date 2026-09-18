/**
 * Вход по QR: ПК показывает код, телефон (уже вошёл) сканирует — оба получают сессию.
 */

import { getAuthAccessToken, persistAuthPayloadFromApi, quickLogin, type AppPendingAuth, type AuthRole } from "@/lib/client/appAuth";
import { getPublicLkOrigin } from "@/lib/client/lkAppUrl";
import { getServerUrl } from "@/lib/client/serverUrl";
import { platformFetch } from "@/lib/client/platformFetch";

export type QrLoginStart = { token: string; qrUrl: string };

export type QrLoginResult =
  | { ok: true; role: AuthRole }
  | { ok: true; pending: AppPendingAuth }
  | { ok: false; error: string };

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 300_000;

function baseUrl(): string {
  const url = getServerUrl();
  if (!url) throw new Error("NEXT_PUBLIC_MINIKBP_SERVER_URL не задан");
  return url.replace(/\/+$/, "");
}

export function buildQrLoginUrl(linkToken: string): string {
  const origin = getPublicLkOrigin().replace(/\/+$/, "");
  return `${origin}/app?link_token=${encodeURIComponent(linkToken)}&from=qr`;
}

/** ПК: начать ожидание сканирования. */
export async function startQrLogin(): Promise<{ ok: true; data: QrLoginStart } | { ok: false; error: string }> {
  try {
    const res = await platformFetch(`${baseUrl()}/v0/auth/app/mobile/link/start/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "qr" }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error: typeof body?.detail === "string" ? body.detail : `Ошибка ${res.status}`,
      };
    }
    const token = typeof body?.token === "string" ? body.token : "";
    if (!token) return { ok: false, error: "Сервер вернул неполный ответ" };
    return { ok: true, data: { token, qrUrl: buildQrLoginUrl(token) } };
  } catch {
    return { ok: false, error: "Сервер недоступен" };
  }
}

async function pollQrOnce(token: string): Promise<QrLoginResult | "pending" | "expired"> {
  try {
    const res = await platformFetch(
      `${baseUrl()}/v0/auth/app/mobile/link/poll/?token=${encodeURIComponent(token)}`,
      { headers: { "Content-Type": "application/json" } }
    );
    const body = await res.json().catch(() => ({}));
    if (res.status === 404 || body?.status === "expired") return "expired";
    if (body?.status === "pending") return "pending";
    if (!res.ok) {
      return { ok: false, error: typeof body?.detail === "string" ? body.detail : `Ошибка ${res.status}` };
    }
    const result = await persistAuthPayloadFromApi(body);
    if ("role" in result) return { ok: true, role: result.role };
    return { ok: true, pending: result.pending };
  } catch {
    return { ok: false, error: "Сервер недоступен" };
  }
}

/** ПК: polling после показа QR. */
export async function waitForQrLogin(token: string): Promise<QrLoginResult> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const r = await pollQrOnce(token);
    if (r === "pending") {
      await new Promise((resolve) => window.setTimeout(resolve, POLL_INTERVAL_MS));
      continue;
    }
    if (r === "expired") {
      return { ok: false, error: "QR-код истёк. Обновите код." };
    }
    return r;
  }
  return { ok: false, error: "Не дождались сканирования. Попробуйте снова." };
}

/** Из текста QR (URL или token) — link_token. */
export function parseQrLinkToken(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    const t = url.searchParams.get("link_token");
    if (t) return t.trim();
  } catch {
    /* plain token */
  }
  if (/^[A-Za-z0-9_-]{8,32}$/.test(text)) return text;
  return null;
}

/** Телефон: подтвердить вход на другом устройстве (нужна локальная сессия). */
export async function confirmQrLoginScan(linkToken: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = linkToken.trim();
  if (!token) return { ok: false, error: "Неверный QR-код" };

  let access = await getAuthAccessToken();
  if (!access) {
    const ql = await quickLogin();
    if (!ql.ok) {
      return { ok: false, error: "Сначала выполните вход на телефоне" };
    }
    access = await getAuthAccessToken();
  }
  if (!access) return { ok: false, error: "Нет активной сессии на телефоне" };

  try {
    const res = await platformFetch(`${baseUrl()}/v0/auth/app/mobile/link/complete/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${access}`,
      },
      body: JSON.stringify({ link_token: token }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error: typeof body?.detail === "string" ? body.detail : `Ошибка ${res.status}`,
      };
    }
    if (body?.status === "link_complete") return { ok: true };
    return { ok: false, error: "Не удалось подтвердить вход" };
  } catch {
    return { ok: false, error: "Сервер недоступен" };
  }
}
