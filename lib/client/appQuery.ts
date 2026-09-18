/** Query-параметры /app: ?do= & ?q= & ?ref= */

import { getPanelAppUrl } from "@/lib/client/lkAppUrl";
import { isNativeApp } from "@/lib/client/platform";

const REFERRAL_KEY = "app_referral_v1";
const REDIRECT_KEY = "app_redirect_q_v1";

/** Стартовый экран мобильного приложения (Capacitor) — оболочка с расписанием. */
export const NATIVE_APP_HOME = "/app/journal?page=timetable";

export type AppAuthAction = "login" | "register" | "verify";

export type AppQueryParams = {
  do?: AppAuthAction;
  q?: string;
  ref?: string;
  verifyEmail?: string;
  invite?: string;
};

const INVITE_STORAGE_KEY = "app_invite_code_v1";

export function parseAppQuery(search: string): AppQueryParams {
  const sp = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const rawDo = sp.get("do") || sp.get("action") || "";
  const doAction =
    rawDo === "register" || rawDo === "verify" || rawDo === "login" ? rawDo : undefined;
  const q = sp.get("q")?.trim() || undefined;
  const ref = sp.get("ref")?.trim() || undefined;
  const verifyEmail = sp.get("verify_email")?.trim() || undefined;
  const inviteRaw = sp.get("invite")?.trim();
  const invite = inviteRaw ? inviteRaw.toUpperCase().replace(/\s+/g, "") : undefined;
  return { do: doAction, q, ref, verifyEmail, invite: invite && invite.length >= 4 ? invite : undefined };
}

export async function persistInviteCode(code: string): Promise<void> {
  const normalized = code.trim().toUpperCase().replace(/\s+/g, "");
  if (normalized.length < 4) return;
  try {
    localStorage.setItem(INVITE_STORAGE_KEY, normalized.slice(0, 32));
  } catch {}
}

export function consumeStoredInviteCode(): string | null {
  try {
    const v = localStorage.getItem(INVITE_STORAGE_KEY);
    if (v) localStorage.removeItem(INVITE_STORAGE_KEY);
    return v?.trim() || null;
  } catch {
    return null;
  }
}

export function peekStoredInviteCode(): string | null {
  try {
    return localStorage.getItem(INVITE_STORAGE_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

/** Убрать do=verify, чтобы кнопка «Назад» не возвращала на шаг подтверждения. */
export function stripVerifyDoFromSearch(search: string): string {
  const sp = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (sp.get("do") === "verify") sp.delete("do");
  const q = sp.toString();
  return q ? `?${q}` : "";
}

/** Безопасный внутренний путь для редиректа после входа. */
export function sanitizeRedirectPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const path = raw.trim();
  if (!path.startsWith("/")) return null;
  if (path.startsWith("//")) return null;
  if (path.includes("://")) return null;
  if (isNativeApp() && path.startsWith("/staff")) return null;
  return path;
}

export async function persistReferral(ref: string): Promise<void> {
  if (!ref.trim()) return;
  try {
    localStorage.setItem(REFERRAL_KEY, ref.trim().slice(0, 64));
  } catch {}
}

export function getStoredReferral(): string | null {
  try {
    return localStorage.getItem(REFERRAL_KEY);
  } catch {
    return null;
  }
}

export async function persistRedirectQ(q: string): Promise<void> {
  const safe = sanitizeRedirectPath(q);
  if (!safe) return;
  try {
    localStorage.setItem(REDIRECT_KEY, safe);
  } catch {}
}

export function consumeRedirectQ(): string | null {
  try {
    const v = localStorage.getItem(REDIRECT_KEY);
    if (v) localStorage.removeItem(REDIRECT_KEY);
    return sanitizeRedirectPath(v);
  } catch {
    return null;
  }
}

export function resolvePostAuthPath(
  role: "student" | "teacher" | "admin",
  explicitQ?: string | null
): string {
  const q = sanitizeRedirectPath(explicitQ) || consumeRedirectQ();
  if (q) return q;
  if (isNativeApp()) return NATIVE_APP_HOME;
  if (role === "admin") return getPanelAppUrl("/staff/groups");
  if (role === "teacher") return getPanelAppUrl("/staff/settings");
  return "/app/journal?page=timetable";
}
