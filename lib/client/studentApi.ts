import { getServerUrl } from "@/lib/client/serverUrl";
import { storageGet, storageRemove, storageSet } from "@/lib/client/storage";
import {
  setKbpLoginData,
  setKbpGroupId,
} from "@/lib/client/kbpStorageKeys";

export type Group = { id: string; name: string };
export type JournalData = {
  months: string[];
  monthColspans: number[];
  dates: string[];
  dateKeys?: string[];
  subjects: {
    id: string;
    name: string;
    shortName?: string;
    fullName?: string;
    gradesMatrix: Record<number, { value: string; kind?: string }[]>;
    average: string;
  }[];
  dayTypes?: Record<number, string>;
  redAbsent?: Record<number, boolean>;
  labDueDates?: Record<number, string | null>;
  labCredited?: Record<number, boolean>;
};
export type LatenessData = {
  months: string[];
  monthColspans: number[];
  dates: string[];
  subjects: {
    id: string;
    name: string;
    latenessMatrix: Record<number, { value: string; type?: string }[]>;
  }[];
};

export type StudentSession = {
  access: string;
  refresh: string;
  studentId: number;
  fullName: string;
  groupId: string;
  groupName: string;
  serverUrl: string;
};

const SESSION_KEY = "student_session_v1";
const GROUPS_CACHE = "cached_django_groups";
const GROUPS_CACHE_AT = "cached_django_groups_at";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function getStudentSession(): Promise<StudentSession | null> {
  const raw = await storageGet(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StudentSession;
  } catch {
    return null;
  }
}

export async function clearStudentSession(): Promise<void> {
  await storageRemove(SESSION_KEY);
}

async function saveSession(session: StudentSession): Promise<void> {
  await storageSet(SESSION_KEY, JSON.stringify(session));
}

function baseUrl(): string {
  const url = getServerUrl();
  if (!url) throw new Error("NEXT_PUBLIC_MINIKBP_SERVER_URL не задан");
  return url;
}

async function api<T>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<{ ok: true; data: T } | { ok: false; detail: string }> {
  try {
    const { fetchWithAuthRetry } = await import("@/lib/client/tokenRefresh");
    const res = await fetchWithAuthRetry(`${baseUrl()}${path}`, {
      ...options,
      token,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers as Record<string, string>),
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = typeof body?.detail === "string" ? body.detail : `Ошибка ${res.status}`;
      if (token) {
        const { handleInvalidToken } = await import("@/lib/client/authSessionGuard");
        handleInvalidToken(res.status, detail, true);
      }
      return {
        ok: false,
        detail,
      };
    }
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, detail: "Сервер недоступен" };
  }
}

export async function getGroups(): Promise<Group[]> {
  const [cachedRaw, cachedAtRaw] = await Promise.all([
    storageGet(GROUPS_CACHE),
    storageGet(GROUPS_CACHE_AT),
  ]);
  const cachedAt = Number(cachedAtRaw || "0");
  if (cachedRaw && Date.now() - cachedAt < WEEK_MS) {
    try {
      const parsed = JSON.parse(cachedRaw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch {}
  }

  const { fetchWithAuthRetry } = await import("@/lib/client/tokenRefresh");
  const res = await fetchWithAuthRetry(`${baseUrl()}/v0/public/groups/`, {
    headers: { Accept: "application/json" },
  });
  const body = await res.json().catch(() => []);
  if (!res.ok) {
    if (res.status === 401) return []; // Silently return empty if unauthorized (public endpoint)
    if (cachedRaw) {
      try {
        return JSON.parse(cachedRaw);
      } catch {}
    }
    const detail = typeof body?.detail === "string" ? body.detail : `Ошибка ${res.status}`;
    throw new Error(detail);
  }
  const data = (Array.isArray(body) ? body : []).map((g: { id: string | number; name: string }) => ({
    id: String(g.id),
    name: g.name,
  }));
  await Promise.all([
    storageSet(GROUPS_CACHE, JSON.stringify(data)),
    storageSet(GROUPS_CACHE_AT, Date.now().toString()),
  ]);
  return data;
}

export async function login(_input: {
  student_name: string;
  group_id: string;
  birth_day: string;
}): Promise<{ success: boolean; error?: string }> {
  return {
    success: false,
    error: "Вход по фамилии и дате рождения отключён. Используйте вход через приложение MiniKBP.",
  };
}

export async function fetchJournal(): Promise<{
  success: boolean;
  data?: JournalData;
  error?: string;
}> {
  const session = await getStudentSession();
  if (!session) return { success: false, error: "Не выполнен вход" };

  const r = await api<JournalData>("/v0/student/journal/", {}, session.access);
  if (!r.ok) return { success: false, error: r.detail };

  await storageSet("cached_journal_data", JSON.stringify(r.data));
  await storageSet("last_journal_fetch", Date.now().toString());
  return { success: true, data: r.data };
}

export async function fetchLateness(): Promise<{
  success: boolean;
  data?: LatenessData;
  error?: string;
}> {
  const session = await getStudentSession();
  if (!session) return { success: false, error: "Не выполнен вход" };

  const r = await api<LatenessData>("/v0/student/lateness/", {}, session.access);
  if (!r.ok) return { success: false, error: r.detail };

  await storageSet("cached_lateness_data", JSON.stringify(r.data));
  await storageSet("last_lateness_fetch", Date.now().toString());
  return { success: true, data: r.data };
}

export async function getCachedFIO(): Promise<string | null> {
  const session = await getStudentSession();
  if (session?.fullName) return session.fullName;
  return storageGet("cached_student_fio");
}

export async function fetchStudentFIO(): Promise<{ success: boolean; fio?: string }> {
  const fio = await getCachedFIO();
  return fio ? { success: true, fio } : { success: false };
}

/** Совместимость: кэшированный журнал без сети. */
export async function getCachedJournal(): Promise<JournalData | null> {
  const raw = await storageGet("cached_journal_data");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function journalDataNeedsKindRefresh(_data: unknown): boolean {
  return false;
}

export function journalMarkAlertStyle(kind?: string): string | undefined {
  return kind === "alert" ? "text-red-600 font-semibold" : undefined;
}
