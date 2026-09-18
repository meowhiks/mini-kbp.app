/** Парсинг hash-callback от Telegram Login Widget / SDK (#tgAuthResult=…). */

import { pickTelegramAuthPayload } from "@/lib/client/telegramAuthPayload";

function decodeTgAuthResult(value: string): Record<string, string | number> | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const json = atob(padded);
    const data = JSON.parse(json) as Record<string, unknown>;
    return pickTelegramAuthPayload(data as Record<string, string | number>);
  } catch {
    return null;
  }
}

function parseHashParams(hash: string): Record<string, string> {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const part of raw.split("&")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = decodeURIComponent(part.slice(0, eq));
    const val = decodeURIComponent(part.slice(eq + 1));
    out[key] = val;
  }
  return out;
}

/** Читает payload из location.hash и убирает hash из адресной строки. */
export function consumeTelegramAuthHash(): Record<string, string | number> | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash;
  if (!hash || hash === "#") return null;

  const params = parseHashParams(hash);
  const tgAuthResult = params.tgAuthResult;
  const payload = tgAuthResult
    ? decodeTgAuthResult(tgAuthResult)
    : pickTelegramAuthPayload(params);

  if (!payload?.id || !payload?.hash) return null;

  const cleanUrl =
    window.location.pathname + window.location.search + window.location.hash.replace(hash, "");
  window.history.replaceState(null, "", cleanUrl.replace(/\?$/, "") || window.location.pathname);

  return payload;
}
