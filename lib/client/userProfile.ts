import { getServerUrl } from "@/lib/client/serverUrl";
import { getAppSession } from "@/lib/client/appAuth";
import { loadStaffSession } from "@/lib/client/miniKbpServer";
import { OFFLINE_CACHE_KEYS, readOfflineCache, writeOfflineCache } from "@/lib/client/offlineCache";

export type UserProfile = {
  email: string;
  nickname: string;
  display_name: string;
  avatar_url: string;
  phone: string;
  gender: "" | "male" | "female" | "other";
  info: string;
  show_group: boolean;
  group_id: string | null;
  group_name: string | null;
  has_group: boolean;
  telegram_username: string;
  has_telegram?: boolean;
  two_fa_enabled: boolean;
  session_ttl_days?: number;
  profile_locked?: boolean;
  profile_locked_at?: string | null;
};

export type TwoFaSetup = {
  secret: string;
  otpauth_url: string;
};

async function authToken(): Promise<string | null> {
  const staff = await loadStaffSession();
  if (staff?.access) return staff.access;
  const app = await getAppSession();
  return app?.access ?? null;
}

function apiBase(): string {
  const url = getServerUrl();
  if (!url) throw new Error("NEXT_PUBLIC_MINIKBP_SERVER_URL не задан");
  return url;
}

async function profileFetch<T>(
  path: string,
  init?: RequestInit
): Promise<{ ok: true; data: T } | { ok: false; error: string; devCode?: string }> {
  const token = await authToken();
  if (!token) return { ok: false, error: "Не выполнен вход" };
  try {
    const { fetchWithAuthRetry } = await import("@/lib/client/tokenRefresh");
    const res = await fetchWithAuthRetry(`${apiBase()}${path}`, {
      ...init,
      token,
      headers: {
        ...(init?.headers || {}),
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    const body = res.status === 204 ? {} : await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = typeof body?.detail === "string" ? body.detail : "Ошибка запроса";
      const { handleInvalidToken } = await import("@/lib/client/authSessionGuard");
      handleInvalidToken(res.status, error, true);
      return {
        ok: false,
        error,
        devCode: typeof body?.dev_code === "string" ? body.dev_code : undefined,
      };
    }
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, error: "Сервер недоступен" };
  }
}

export async function getCachedProfile(): Promise<UserProfile | null> {
  return readOfflineCache<UserProfile>(OFFLINE_CACHE_KEYS.USER_PROFILE);
}

export async function fetchProfile(): Promise<
  { ok: true; data: UserProfile; fromCache?: boolean } | { ok: false; error: string }
> {
  const r = await profileFetch<UserProfile>("/v0/app/profile/");
  if (r.ok) {
    await writeOfflineCache(OFFLINE_CACHE_KEYS.USER_PROFILE, r.data);
    return r;
  }
  const cached = await getCachedProfile();
  if (cached) return { ok: true, data: cached, fromCache: true };
  return r;
}

export async function saveProfile(
  patch: Partial<UserProfile>
): Promise<{ ok: true; data: UserProfile } | { ok: false; error: string }> {
  const r = await profileFetch<UserProfile>("/v0/app/profile/", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  if (r.ok) await writeOfflineCache(OFFLINE_CACHE_KEYS.USER_PROFILE, r.data);
  return r;
}

export async function requestEmailChange(
  email: string
): Promise<{ ok: true; email: string; devCode?: string } | { ok: false; error: string }> {
  const r = await profileFetch<{ ok?: boolean; email?: string; dev_code?: string }>("/v0/app/profile/email/request/", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  if (!r.ok) return r;
  return { ok: true, email: r.data.email || email, devCode: r.data.dev_code };
}

export async function confirmEmailChange(
  code: string
): Promise<{ ok: true; data: UserProfile } | { ok: false; error: string }> {
  const r = await profileFetch<UserProfile>("/v0/app/profile/email/confirm/", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  if (r.ok) await writeOfflineCache(OFFLINE_CACHE_KEYS.USER_PROFILE, r.data);
  return r;
}

export async function setupTwoFa(): Promise<{ ok: true; data: TwoFaSetup } | { ok: false; error: string }> {
  return profileFetch<TwoFaSetup>("/v0/app/profile/2fa/setup/", { method: "POST" });
}

export async function enableTwoFa(
  totpCode: string
): Promise<{ ok: true; data: UserProfile } | { ok: false; error: string }> {
  const r = await profileFetch<UserProfile>("/v0/app/profile/2fa/enable/", {
    method: "POST",
    body: JSON.stringify({ totp_code: totpCode }),
  });
  if (r.ok) await writeOfflineCache(OFFLINE_CACHE_KEYS.USER_PROFILE, r.data);
  return r;
}

export async function disableTwoFa(
  totpCode: string
): Promise<{ ok: true; data: UserProfile } | { ok: false; error: string }> {
  const r = await profileFetch<UserProfile>("/v0/app/profile/2fa/disable/", {
    method: "POST",
    body: JSON.stringify({ totp_code: totpCode }),
  });
  if (r.ok) await writeOfflineCache(OFFLINE_CACHE_KEYS.USER_PROFILE, r.data);
  return r;
}

export async function deleteOwnAccount(payload: {
  confirm_email?: string;
  confirm_name?: string;
  password?: string;
  totp_code?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await profileFetch<Record<string, never>>("/v0/app/profile/delete/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!r.ok) return r;
  return { ok: true };
}

export async function linkTelegramToProfile(): Promise<
  { ok: true; username: string } | { ok: false; error: string }
> {
  const { signInWithTelegramBotLink } = await import("@/lib/client/telegramBotLink");
  const r = await signInWithTelegramBotLink();
  if (!r.ok) return { ok: false, error: r.error };
  if ("linked" in r && r.linked) {
    return { ok: true, username: r.telegram_username };
  }
  return { ok: false, error: "Не удалось привязать Telegram к текущему аккаунту" };
}
