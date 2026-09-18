import { getPanelAppUrl } from "@/lib/client/lkAppUrl";
import { getStoredReferral } from "@/lib/client/appQuery";
import { loadStaffSession, saveStaffSession, type StaffRole } from "@/lib/client/miniKbpServer";
import { OFFLINE_CACHE_KEYS, readOfflineCache, writeOfflineCache } from "@/lib/client/offlineCache";
import { isNativeApp } from "@/lib/client/platform";
import { getServerUrl } from "@/lib/client/serverUrl";
import { platformFetch } from "@/lib/client/platformFetch";
import { clientKindHeaders } from "@/lib/client/tokenRefresh";
import { storageGet, storageRemove, storageSet } from "@/lib/client/storage";
import { clearTelegramOAuthSession } from "@/lib/client/telegramOAuthSession";
import { pickTelegramAuthPayload } from "@/lib/client/telegramAuthPayload";

export type AppPendingAuth = {
  pendingToken: string;
  needs2fa: boolean;
  needsCuratorCode?: boolean;
  displayName?: string;
  email?: string;
};

export type AppSession = {
  access: string;
  refresh: string;
  studentId: number;
  fullName: string;
  groupId: string;
  groupName: string;
  twoFaEnabled: boolean;
  serverUrl: string;
};

export type AuthRole = "student" | "teacher" | "admin";

export type LinkAuthComplete = { ok: true; linkComplete: true };

const PENDING_KEY = "app_auth_pending_v1";
const SESSION_KEY = "app_session_v1";

function baseUrl(): string {
  const url = getServerUrl();
  if (!url) throw new Error("NEXT_PUBLIC_MINIKBP_SERVER_URL не задан");
  return url;
}

async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<
  | { ok: true; data: T }
  | {
      ok: false;
      detail: string;
      status: number;
      needs2fa?: boolean;
      pendingToken?: string;
      needsEmailVerify?: boolean;
      email?: string;
      devCode?: string;
    }
> {
  try {
    const headers = options.headers as Record<string, string> | undefined;
    const token = headers?.Authorization?.replace(/^Bearer\s+/i, "") || headers?.authorization?.replace(/^Bearer\s+/i, "");
    const { fetchWithAuthRetry } = await import("@/lib/client/tokenRefresh");
    const res = await fetchWithAuthRetry(`${baseUrl()}${path}`, {
      ...options,
      token: token || undefined,
      headers: {
        "Content-Type": "application/json",
        ...clientKindHeaders(),
        ...(options.headers as Record<string, string>),
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = typeof body?.detail === "string" ? body.detail : `Ошибка ${res.status}`;
      const headers = options.headers as Record<string, string> | undefined;
      const hadAuth = Boolean(headers?.Authorization || headers?.authorization);
      if (hadAuth) {
        const { handleInvalidToken } = await import("@/lib/client/authSessionGuard");
        handleInvalidToken(res.status, detail, true);
      }
      return {
        ok: false,
        status: res.status,
        detail,
        needs2fa: Boolean(body?.needs_2fa),
        pendingToken: typeof body?.pending_token === "string" ? body.pending_token : undefined,
        needsEmailVerify: Boolean(body?.needs_email_verify),
        email: typeof body?.email === "string" ? body.email : undefined,
        devCode: typeof body?.dev_code === "string" ? body.dev_code : undefined,
      };
    }
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, status: 0, detail: "Сервер недоступен" };
  }
}

type AuthPayload = {
  skip_verify?: boolean;
  role?: AuthRole;
  pending_token?: string;
  needs_curator_code?: boolean;
  needs_email_verify?: boolean;
  dev_code?: string;
  needs_2fa?: boolean;
  display_name?: string;
  email?: string;
  access?: string;
  refresh?: string;
  student_id?: number;
  teacher_id?: number;
  full_name?: string;
  group_id?: string;
  group_name?: string;
  two_fa_enabled?: boolean;
  username?: string;
  is_superuser?: boolean;
  status?: string;
  quick_login_token?: string;
};

function withLinkToken(body: Record<string, unknown>, linkToken?: string): Record<string, unknown> {
  if (linkToken?.trim()) body.link_token = linkToken.trim();
  return body;
}

async function resolveAuthResult(
  data: AuthPayload
): Promise<{ role: AuthRole } | { pending: AppPendingAuth } | { linkComplete: true }> {
  if (data.status === "link_complete") return { linkComplete: true };
  return persistAuthPayload(data);
}

export function authRedirectPath(role: AuthRole): string {
  if (isNativeApp()) return "/app/journal?page=timetable";
  if (role === "admin") return getPanelAppUrl("/staff/dashboard");
  if (role === "teacher") return getPanelAppUrl("/staff/settings");
  return "/app/journal?page=timetable";
}

export async function savePendingAuth(pending: AppPendingAuth): Promise<void> {
  await storageSet(PENDING_KEY, JSON.stringify(pending));
}

export async function getPendingAuth(): Promise<AppPendingAuth | null> {
  const raw = await storageGet(PENDING_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AppPendingAuth;
  } catch {
    return null;
  }
}

export async function clearPendingAuth(): Promise<void> {
  await storageRemove(PENDING_KEY);
}

export async function getAppSession(): Promise<AppSession | null> {
  const raw = await storageGet(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AppSession;
  } catch {
    return null;
  }
}

/** Access-токен из staff / app / legacy student session (как в профиле). */
export async function getAuthAccessToken(): Promise<string | null> {
  const staff = await loadStaffSession();
  if (staff?.access) return staff.access;
  const session = await getAppSession();
  if (session?.access) return session.access;
  const raw = await storageGet("student_session_v1");
  if (!raw) return null;
  try {
    const legacy = JSON.parse(raw) as { access?: string };
    return legacy.access ?? null;
  } catch {
    return null;
  }
}

export async function clearAppSession(): Promise<void> {
  await storageRemove(SESSION_KEY);
  await storageRemove("student_session_v1");
}

/** Обновить access/refresh во всех локальных сессиях после silent refresh. */
export async function updateAuthTokens(access: string, refresh: string): Promise<void> {
  const session = await getAppSession();
  if (session) {
    await saveAppSession({ ...session, access, refresh });
  }
  const { loadStaffSession, saveStaffSession } = await import("@/lib/client/miniKbpServer");
  const staff = await loadStaffSession();
  if (staff) {
    await saveStaffSession({ ...staff, access, refresh });
  }
  const raw = await storageGet("student_session_v1");
  if (raw) {
    try {
      const student = JSON.parse(raw) as AppSession;
      await storageSet("student_session_v1", JSON.stringify({ ...student, access, refresh }));
    } catch {
      /* ignore */
    }
  }
}

/** Восстановление сессии после deep link из системного браузера (Google). */
export async function restoreAppSession(session: AppSession): Promise<void> {
  await saveAppSession(session);
}

async function saveAppSession(session: AppSession): Promise<void> {
  await storageSet(SESSION_KEY, JSON.stringify(session));
  await storageSet(
    "student_session_v1",
    JSON.stringify({
      access: session.access,
      refresh: session.refresh,
      studentId: session.studentId,
      fullName: session.fullName,
      groupId: session.groupId,
      groupName: session.groupName,
      serverUrl: session.serverUrl,
    })
  );
  if (session.groupId) {
    const { setKbpGroupId } = await import("@/lib/client/kbpStorageKeys");
    await setKbpGroupId(session.groupId);
  }
}

function toPending(data: AuthPayload): AppPendingAuth {
  return {
    pendingToken: data.pending_token!,
    needs2fa: Boolean(data.needs_2fa),
    needsCuratorCode: data.needs_curator_code !== false,
    displayName: data.display_name,
    email: data.email,
  };
}

async function persistAuthPayload(data: AuthPayload): Promise<{ role: AuthRole } | { pending: AppPendingAuth }> {
  if (data.skip_verify && data.access && data.refresh) {
    const role = (data.role || "student") as AuthRole;
    const serverUrl = baseUrl();

    if (role === "admin" || role === "teacher") {
      await saveStaffSession({
        role: role as StaffRole,
        access: data.access,
        refresh: data.refresh,
        serverUrl,
        teacherId: data.teacher_id,
        fullName: data.full_name,
        username: data.username,
        isSuperuser: data.is_superuser,
      });
      await clearPendingAuth();
      if (data.quick_login_token) {
        await storageSet(QUICK_LOGIN_KEY, String(data.quick_login_token));
      }
      void issueAppSession(data.access);
      return { role };
    }

    await saveAppSession({
      access: data.access,
      refresh: data.refresh,
      studentId: data.student_id ?? 0,
      fullName: data.full_name ?? "",
      groupId: data.group_id ?? "",
      groupName: data.group_name ?? "",
      twoFaEnabled: Boolean(data.two_fa_enabled),
      serverUrl,
    });
    await clearPendingAuth();
    if (data.quick_login_token) {
      await storageSet(QUICK_LOGIN_KEY, String(data.quick_login_token));
    }
    void issueAppSession(data.access);
    return { role: "student" };
  }

  const pending = toPending(data);
  await savePendingAuth(pending);
  return { pending };
}

/** Ответ /v0/auth/app/mobile/exchange/ или прямой auth payload. */
export async function persistAuthPayloadFromApi(
  data: AuthPayload
): Promise<{ role: AuthRole } | { pending: AppPendingAuth }> {
  return persistAuthPayload(data);
}

/** Поднять JWT из cookie minikbp_session (общий домен .mini-kbp.site) на panel. */
export async function restoreStaffSessionFromCookie(): Promise<StaffRole | null> {
  try {
    const res = await platformFetch(`${baseUrl()}/v0/auth/cookie-session/`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...clientKindHeaders(),
      },
      body: "{}",
    });
    const data = (await res.json().catch(() => ({}))) as AuthPayload;
    if (!res.ok || !data.skip_verify || !data.access || !data.refresh) return null;
    if (data.role !== "admin" && data.role !== "teacher") return null;
    const result = await persistAuthPayload(data);
    if ("role" in result && (result.role === "admin" || result.role === "teacher")) {
      return result.role;
    }
    return null;
  } catch {
    return null;
  }
}

const QUICK_LOGIN_KEY = "app_quick_login_token_v1";

export async function issueAppSession(accessToken?: string): Promise<void> {
  try {
    const token = accessToken || (await getAppSession())?.access;
    if (!token) return;
    const kind = isNativeApp() ? "mobile" : "web";
    const res = await platformFetch(`${baseUrl()}/v0/auth/issue-session/`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Client-Kind": kind,
      },
      body: JSON.stringify({ device_kind: kind }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body?.quick_login_token) {
      await storageSet(QUICK_LOGIN_KEY, String(body.quick_login_token));
    }
  } catch {
    /* ignore */
  }
}

export type AppSessionRow = {
  id: number;
  device_kind: string;
  trust_level: number;
  user_agent: string;
  ip_address: string | null;
  created_at: string;
  last_seen: string;
  expires_at: string;
  is_current: boolean;
  is_most_trusted: boolean;
};

export type CachedAppSessions = {
  sessions: AppSessionRow[];
  session_ttl_days: number;
};

export async function getCachedAppSessions(): Promise<CachedAppSessions | null> {
  return readOfflineCache<CachedAppSessions>(OFFLINE_CACHE_KEYS.APP_SESSIONS);
}

export async function fetchAppSessions(): Promise<
  | { ok: true; sessions: AppSessionRow[]; session_ttl_days: number; fromCache?: boolean }
  | { ok: false; error: string }
> {
  const session = await getAppSession();
  const staff = await import("@/lib/client/miniKbpServer").then((m) => m.loadStaffSession());
  const token = staff?.access || session?.access;
  if (!token) return { ok: false, error: "Не выполнен вход" };
  try {
    const res = await platformFetch(`${baseUrl()}/v0/auth/sessions/`, {
      credentials: "include",
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = typeof body?.detail === "string" ? body.detail : `Ошибка ${res.status}`;
      const { handleInvalidToken } = await import("@/lib/client/authSessionGuard");
      handleInvalidToken(res.status, detail, true);
      const cached = await getCachedAppSessions();
      if (cached && res.status !== 401) {
        return { ok: true, sessions: cached.sessions, session_ttl_days: cached.session_ttl_days, fromCache: true };
      }
      return { ok: false, error: detail };
    }
    const payload: CachedAppSessions = {
      sessions: (body.sessions || []) as AppSessionRow[],
      session_ttl_days: Number(body.session_ttl_days) || 30,
    };
    await writeOfflineCache(OFFLINE_CACHE_KEYS.APP_SESSIONS, payload);
    return { ok: true, ...payload };
  } catch {
    const cached = await getCachedAppSessions();
    if (cached) {
      return { ok: true, sessions: cached.sessions, session_ttl_days: cached.session_ttl_days, fromCache: true };
    }
    return { ok: false, error: "Сервер недоступен" };
  }
}

export async function revokeAppSession(id: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getAppSession();
  const staff = await import("@/lib/client/miniKbpServer").then((m) => m.loadStaffSession());
  const token = staff?.access || session?.access;
  if (!token) return { ok: false, error: "Не выполнен вход" };
  try {
    const res = await platformFetch(`${baseUrl()}/v0/auth/sessions/${id}/`, {
      method: "DELETE",
      credentials: "include",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const detail = typeof body?.detail === "string" ? body.detail : `Ошибка ${res.status}`;
      const { handleInvalidToken } = await import("@/lib/client/authSessionGuard");
      handleInvalidToken(res.status, detail, true);
      return { ok: false, error: detail };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Сервер недоступен" };
  }
}

export async function logoutApp(): Promise<void> {
  const session = await getAppSession();
  const staff = await import("@/lib/client/miniKbpServer").then((m) => m.loadStaffSession());
  const token = staff?.access || session?.access;
  if (token) {
    try {
      await platformFetch(`${baseUrl()}/v0/auth/logout/`, {
        method: "POST",
        credentials: "include",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      /* ignore */
    }
  }
  await clearAppSession();
  await storageRemove(QUICK_LOGIN_KEY);
  clearTelegramOAuthSession();
  const { clearStaffSession } = await import("@/lib/client/miniKbpServer");
  await clearStaffSession();
}

export async function quickLogin(): Promise<
  { ok: true; role: AuthRole } | { ok: false; error: string }
> {
  const token = await storageGet(QUICK_LOGIN_KEY);
  if (!token) return { ok: false, error: "Нет сохранённого быстрого входа" };
  const r = await api<AuthPayload>("/v0/auth/quick-login/", {
    method: "POST",
    body: JSON.stringify({
      quick_login_token: token,
      device_kind: isNativeApp() ? "mobile" : "web",
    }),
  });
  if (!r.ok) return { ok: false, error: r.detail };
  const result = await persistAuthPayload(r.data);
  if ("role" in result) return { ok: true, role: result.role };
  return { ok: false, error: "Требуется дополнительная проверка" };
}

export async function getQuickLoginAvailable(): Promise<boolean> {
  return Boolean(await storageGet(QUICK_LOGIN_KEY));
}

export async function registerWithEmail(_input: {
  email: string;
  password: string;
  passwordConfirm: string;
  linkToken?: string;
}): Promise<
  | { ok: true; role: AuthRole }
  | { ok: true; pending: AppPendingAuth }
  | { ok: true; needsEmailVerify: true; email: string; devCode?: string }
  | LinkAuthComplete
  | { ok: false; error: string; needsEmailVerify?: boolean; email?: string; devCode?: string }
> {
  // Registration disabled in mini-kbp-timetable fork.
  return { ok: false, error: "Регистрация отключена. Войдите в существующий аккаунт." };
}

export async function loginWithEmail(input: {
  email: string;
  password: string;
  linkToken?: string;
}): Promise<
  | { ok: true; role: AuthRole }
  | { ok: true; pending: AppPendingAuth }
  | LinkAuthComplete
  | { ok: false; error: string; needsEmailVerify?: boolean; email?: string; devCode?: string }
> {
  const r = await api<AuthPayload>("/v0/auth/app/login/", {
    method: "POST",
    body: JSON.stringify(withLinkToken({ email: input.email, password: input.password }, input.linkToken)),
  });
  if (!r.ok) {
    return {
      ok: false,
      error: r.detail,
      needsEmailVerify: r.needsEmailVerify,
      email: r.email,
      devCode: r.devCode,
    };
  }
  if (r.data.needs_email_verify) {
    return {
      ok: false,
      error: "Подтвердите email — проверьте почту",
      needsEmailVerify: true,
      email: r.data.email,
      devCode: r.data.dev_code,
    };
  }
  const result = await resolveAuthResult(r.data);
  if ("linkComplete" in result) return { ok: true, linkComplete: true };
  if ("role" in result) return { ok: true, role: result.role };
  return { ok: true, pending: result.pending };
}

export async function loginWithTelegram(
  data: Record<string, string | number> & { id_token?: string },
  linkToken?: string
): Promise<
  { ok: true; role: AuthRole } | { ok: true; pending: AppPendingAuth } | LinkAuthComplete | { ok: false; error: string }
> {
  const body =
    typeof data.id_token === "string" && data.id_token.trim()
      ? { id_token: data.id_token.trim() }
      : pickTelegramAuthPayload(data);
  const r = await api<AuthPayload>("/v0/auth/app/telegram/", {
    method: "POST",
    body: JSON.stringify(withLinkToken(body, linkToken)),
  });
  if (!r.ok) return { ok: false, error: r.detail };
  const result = await resolveAuthResult(r.data);
  if ("linkComplete" in result) return { ok: true, linkComplete: true };
  if ("role" in result) return { ok: true, role: result.role };
  return { ok: true, pending: result.pending };
}

export async function loginWithTelegramOidcCode(input: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<
  { ok: true; role: AuthRole } | { ok: true; pending: AppPendingAuth } | { ok: false; error: string }
> {
  const r = await api<AuthPayload>("/v0/auth/app/telegram/", {
    method: "POST",
    body: JSON.stringify({
      code: input.code.trim(),
      code_verifier: input.codeVerifier.trim(),
      redirect_uri: input.redirectUri.trim(),
    }),
  });
  if (!r.ok) return { ok: false, error: r.detail };
  const result = await persistAuthPayload(r.data);
  if ("role" in result) return { ok: true, role: result.role };
  return { ok: true, pending: result.pending };
}

export async function loginWithGoogle(
  credential: string,
  linkToken?: string
): Promise<
  { ok: true; role: AuthRole } | { ok: true; pending: AppPendingAuth } | LinkAuthComplete | { ok: false; error: string }
> {
  const r = await api<AuthPayload>("/v0/auth/app/google/", {
    method: "POST",
    body: JSON.stringify(withLinkToken({ credential: credential.trim() }, linkToken)),
  });
  if (!r.ok) return { ok: false, error: r.detail };
  const result = await resolveAuthResult(r.data);
  if ("linkComplete" in result) return { ok: true, linkComplete: true };
  if ("role" in result) return { ok: true, role: result.role };
  return { ok: true, pending: result.pending };
}

export async function verifyTwoFaLogin(input: {
  pendingToken: string;
  totpCode: string;
  linkToken?: string;
}): Promise<{ ok: true; role: AuthRole } | LinkAuthComplete | { ok: false; error: string }> {
  const r = await api<AuthPayload>("/v0/auth/app/2fa/", {
    method: "POST",
    body: JSON.stringify(
      withLinkToken(
        {
          pending_token: input.pendingToken,
          totp_code: input.totpCode,
        },
        input.linkToken
      )
    ),
  });
  if (!r.ok) return { ok: false, error: r.detail };
  const result = await resolveAuthResult({ ...r.data, skip_verify: true });
  if ("linkComplete" in result) return { ok: true, linkComplete: true };
  if ("role" in result) return { ok: true, role: result.role };
  return { ok: true, role: "student" };
}

export async function requestPasswordReset(
  email: string
): Promise<{ ok: true; devCode?: string } | { ok: false; error: string }> {
  const r = await api<{ ok?: boolean; dev_code?: string }>("/v0/auth/app/password-reset/", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  if (!r.ok) return { ok: false, error: r.detail };
  return { ok: true, devCode: r.data.dev_code };
}

export async function confirmPasswordReset(input: {
  email: string;
  code: string;
  password: string;
  passwordConfirm: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await api<{ ok?: boolean }>("/v0/auth/app/password-reset/confirm/", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      code: input.code,
      password: input.password,
      password_confirm: input.passwordConfirm,
    }),
  });
  if (!r.ok) return { ok: false, error: r.detail };
  return { ok: true };
}

export async function verifyRegistrationEmail(input: {
  token?: string;
  email?: string;
  code?: string;
  linkToken?: string;
}): Promise<
  | { ok: true; role: AuthRole }
  | { ok: true; pending: AppPendingAuth }
  | LinkAuthComplete
  | { ok: false; error: string }
> {
  const r = await api<AuthPayload>("/v0/auth/app/verify-email/", {
    method: "POST",
    body: JSON.stringify(
      withLinkToken(
        {
          token: input.token || "",
          email: input.email || "",
          code: input.code || "",
        },
        input.linkToken
      )
    ),
  });
  if (!r.ok) return { ok: false, error: r.detail };
  const result = await resolveAuthResult(r.data);
  if ("linkComplete" in result) return { ok: true, linkComplete: true };
  if ("role" in result) return { ok: true, role: result.role };
  return { ok: true, pending: result.pending };
}

export async function verifyAccess(input: {
  pendingToken: string;
  curatorCode: string;
  totpCode?: string;
  linkToken?: string;
}): Promise<
  | { ok: true; role: AuthRole }
  | LinkAuthComplete
  | { ok: false; error: string; needs2fa?: boolean; pendingToken?: string }
> {
  const r = await api<AuthPayload>("/v0/auth/app/verify/", {
    method: "POST",
    body: JSON.stringify(
      withLinkToken(
        {
          pending_token: input.pendingToken,
          curator_code: input.curatorCode,
          totp_code: input.totpCode || "",
        },
        input.linkToken
      )
    ),
  });

  if (!r.ok) {
    if (r.needs2fa && r.pendingToken) {
      await savePendingAuth({
        pendingToken: r.pendingToken,
        needs2fa: true,
        needsCuratorCode: true,
      });
    }
    return {
      ok: false,
      error: r.detail,
      needs2fa: r.needs2fa,
      pendingToken: r.pendingToken,
    };
  }

  const result = await resolveAuthResult({ ...r.data, skip_verify: true });
  if ("linkComplete" in result) return { ok: true, linkComplete: true };
  if ("role" in result) return { ok: true, role: result.role };
  return { ok: true, role: "student" };
}

export function getTelegramBotUsername(): string | null {
  const v = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.trim();
  return v || null;
}

export function getTelegramBotClientId(): string | null {
  const v = process.env.NEXT_PUBLIC_TELEGRAM_BOT_CLIENT_ID?.trim();
  return v || null;
}

export type TelegramPublicConfig = {
  username: string | null;
  clientId: string | null;
  loginHost: string | null;
};

let telegramConfigCache: TelegramPublicConfig | undefined;

/** Username + Client ID (числовой id бота) из env или API. */
export async function resolveTelegramConfig(): Promise<TelegramPublicConfig> {
  const fromEnv: TelegramPublicConfig = {
    username: getTelegramBotUsername(),
    clientId: getTelegramBotClientId(),
    loginHost: null,
  };
  if (fromEnv.username && fromEnv.clientId) return fromEnv;
  if (telegramConfigCache !== undefined) return telegramConfigCache;

  try {
    const res = await platformFetch(`${getServerUrl()}/v0/public/app-config/`);
    const body = await res.json().catch(() => ({}));
    telegramConfigCache = {
      username:
        fromEnv.username ||
        (typeof body?.telegram_bot_username === "string" ? body.telegram_bot_username.trim() : null),
      clientId:
        fromEnv.clientId ||
        (body?.telegram_bot_client_id != null ? String(body.telegram_bot_client_id) : null),
      loginHost:
        typeof body?.telegram_login_host === "string" ? body.telegram_login_host.trim() : null,
    };
    return telegramConfigCache;
  } catch {
    telegramConfigCache = fromEnv;
    return fromEnv;
  }
}

/** @deprecated use resolveTelegramConfig */
export async function resolveTelegramBotUsername(): Promise<string | null> {
  const cfg = await resolveTelegramConfig();
  return cfg.username;
}
