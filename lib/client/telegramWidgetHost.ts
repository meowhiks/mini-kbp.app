/** Домен, привязанный к боту в BotFather (/setdomain). */

import { getPublicLkOrigin, PRODUCTION_LK_ORIGIN } from "@/lib/client/lkAppUrl";
import { isNativeApp } from "@/lib/client/platform";

function parseHostname(url: string): string | null {
  const raw = url.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return u.hostname || null;
  } catch {
    return null;
  }
}

/** Канонический origin для Telegram Login (BotFather /setdomain). */
export function getTelegramLoginOrigin(): string {
  return getPublicLkOrigin();
}

export function getTelegramLoginHostname(): string {
  return parseHostname(getTelegramLoginOrigin()) || new URL(PRODUCTION_LK_ORIGIN).hostname;
}

const LOCAL_DEV_HOSTS = new Set(["localhost", "127.0.0.1"]);

/**
 * Telegram Login Widget работает только на домене из BotFather.
 * localhost:3000, IP и другие поддомены дадут «Bot domain invalid».
 */
export function isTelegramWidgetHostValid(): boolean {
  if (typeof window === "undefined") return true;
  if (isNativeApp()) return true;
  const current = window.location.hostname;
  const canonical = getTelegramLoginHostname();
  if (current === canonical) return true;
  if (LOCAL_DEV_HOSTS.has(current)) return false;
  return false;
}

export function telegramLoginAppUrl(path = "/app"): string {
  const origin = getTelegramLoginOrigin();
  return `${origin.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}
