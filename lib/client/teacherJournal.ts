import type { StaffSession, TeachingAssignment } from "@/lib/client/miniKbpServer";
import { getServerUrl } from "@/lib/client/serverUrl";
import { platformFetch } from "@/lib/client/platformFetch";
import { OFFLINE_CACHE_KEYS, readOfflineCache, writeOfflineCache } from "@/lib/client/offlineCache";
import { storageGetObject, storageSetObject } from "@/lib/client/storage";

export type JournalAccessGroup = {
  id: number;
  name: string;
  /** Группа, где текущий учитель — куратор (с API; опционально для старого кэша). */
  is_curator?: boolean;
  assignments: (TeachingAssignment & { can_edit: boolean })[];
};

/** Группы без активных студентов не показываем (дублирует фильтр API для старого кэша). */
export function filterJournalAccessGroups(groups: JournalAccessGroup[]): JournalAccessGroup[] {
  return groups.filter((g) => g.assignments.length > 0);
}

export type JournalDayRecord = {
  id?: number;
  assignment: number;
  date: string;
  slot?: number;
  day_type: "normal" | "lab" | "okr";
  footer_note: string;
  lab_due_date?: string | null;
  lab_credited?: boolean;
  red_absent?: boolean;
};

export type LatenessRecord = {
  id?: number;
  group: number;
  student: number;
  date: string;
  slot?: number;
  minutes: number;
};

export type JournalBundle = {
  assignment: TeachingAssignment;
  can_edit: boolean;
  students: { id: number; full_name: string; record_book_number: string }[];
  grades: {
    id: number;
    student: number;
    date: string;
    slot?: number;
    value: string;
    comment: string;
  }[];
  days: JournalDayRecord[];
  lateness: LatenessRecord[];
};

export type StaffFetchResult<T> = { data: T; fromCache: boolean };

type StaffBundleMap = Record<string, JournalBundle>;

async function readStaffBundleMap(): Promise<StaffBundleMap> {
  return (await storageGetObject<StaffBundleMap>(OFFLINE_CACHE_KEYS.STAFF_BUNDLES)) ?? {};
}

async function writeStaffBundle(assignmentId: number, bundle: JournalBundle): Promise<void> {
  const map = await readStaffBundleMap();
  map[String(assignmentId)] = bundle;
  await storageSetObject(OFFLINE_CACHE_KEYS.STAFF_BUNDLES, map);
}

export async function getCachedJournalAccess(): Promise<JournalAccessGroup[] | null> {
  return readOfflineCache<JournalAccessGroup[]>(OFFLINE_CACHE_KEYS.STAFF_JOURNAL_ACCESS);
}

export async function getCachedJournalBundle(assignmentId: number): Promise<JournalBundle | null> {
  const map = await readStaffBundleMap();
  return map[String(assignmentId)] ?? null;
}

async function api<T>(
  session: StaffSession,
  path: string,
  options: RequestInit = {}
): Promise<{ ok: true; data: T } | { ok: false; detail: string }> {
  const base = session.serverUrl || getServerUrl();
  try {
    const res = await platformFetch(`${base}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access}`,
        ...(options.headers as Record<string, string>),
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = typeof body?.detail === "string" ? body.detail : `Ошибка ${res.status}`;
      const { handleInvalidToken } = await import("@/lib/client/authSessionGuard");
      handleInvalidToken(res.status, detail, true);
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

export async function fetchJournalAccess(
  session: StaffSession
): Promise<StaffFetchResult<JournalAccessGroup[]>> {
  const r = await api<JournalAccessGroup[]>(session, "/v0/journal/");
  if (r.ok) {
    await writeOfflineCache(OFFLINE_CACHE_KEYS.STAFF_JOURNAL_ACCESS, r.data);
    return { data: r.data, fromCache: false };
  }
  const cached = await getCachedJournalAccess();
  if (cached?.length) return { data: cached, fromCache: true };
  return { data: [], fromCache: true };
}

export async function fetchJournalBundle(
  session: StaffSession,
  assignmentId: number
): Promise<StaffFetchResult<JournalBundle> | null> {
  const r = await api<JournalBundle>(session, `/v0/journal/bundle/${assignmentId}/`);
  if (r.ok) {
    await writeStaffBundle(assignmentId, r.data);
    return { data: r.data, fromCache: false };
  }
  const cached = await getCachedJournalBundle(assignmentId);
  if (cached) return { data: cached, fromCache: true };
  return null;
}

export function normDate(d: string): string {
  return d.slice(0, 10);
}

export type SaveGradeInput = {
  assignment: number;
  student: number;
  date: string;
  value: string;
  slot?: number;
  gradeId?: number;
};

export async function saveGrade(session: StaffSession, input: SaveGradeInput) {
  const date = normDate(input.date);
  if (input.gradeId) {
    return api(session, `/v0/grades/${input.gradeId}/`, {
      method: "PATCH",
      body: JSON.stringify({ value: input.value }),
    });
  }
  const slot = input.slot ?? 0;
  const existing = await api<{ id: number; date: string; slot?: number }[]>(
    session,
    `/v0/grades/?assignment=${input.assignment}&student=${input.student}`
  );
  const match = existing.ok
    ? existing.data.find((g) => normDate(g.date) === date && (g.slot ?? 0) === slot)
    : undefined;
  if (match) {
    return api(session, `/v0/grades/${match.id}/`, {
      method: "PATCH",
      body: JSON.stringify({ value: input.value }),
    });
  }
  return api(session, "/v0/grades/", {
    method: "POST",
    body: JSON.stringify({ ...input, date, slot }),
  });
}

export async function deleteGrade(session: StaffSession, gradeId: number) {
  return api(session, `/v0/grades/${gradeId}/`, { method: "DELETE" });
}

export async function saveJournalDay(
  session: StaffSession,
  input: {
    assignment: number;
    date: string;
    slot?: number;
    day_type?: string;
    footer_note?: string;
    lab_due_date?: string | null;
    lab_credited?: boolean;
    red_absent?: boolean;
  }
) {
  const date = normDate(input.date);
  const slot = input.slot ?? 0;
  const existing = await api<JournalDayRecord[]>(
    session,
    `/v0/journal-days/?assignment=${input.assignment}`
  );
  const match = existing.ok
    ? existing.data.find((d) => normDate(d.date) === date && (d.slot ?? 0) === slot)
    : undefined;
  const payload: Record<string, unknown> = {};
  if (input.day_type !== undefined) payload.day_type = input.day_type;
  if (input.footer_note !== undefined) payload.footer_note = input.footer_note;
  if (input.lab_due_date !== undefined) payload.lab_due_date = input.lab_due_date;
  if (input.lab_credited !== undefined) payload.lab_credited = input.lab_credited;
  if (input.red_absent !== undefined) payload.red_absent = input.red_absent;
  if (match?.id) {
    return api(session, `/v0/journal-days/${match.id}/`, {
      method: "PATCH",
      body: JSON.stringify({
        day_type: input.day_type ?? match.day_type,
        footer_note: input.footer_note ?? match.footer_note,
        lab_due_date: input.lab_due_date ?? match.lab_due_date ?? null,
        lab_credited: input.lab_credited ?? match.lab_credited ?? false,
        red_absent: input.red_absent ?? match.red_absent ?? false,
        ...payload,
      }),
    });
  }
  return api(session, "/v0/journal-days/", {
    method: "POST",
    body: JSON.stringify({
      assignment: input.assignment,
      date,
      slot,
      day_type: input.day_type ?? "normal",
      footer_note: input.footer_note ?? "",
      lab_due_date: input.lab_due_date ?? null,
      lab_credited: input.lab_credited ?? false,
      red_absent: input.red_absent ?? false,
    }),
  });
}

export async function deleteJournalDay(session: StaffSession, dayId: number) {
  return api(session, `/v0/journal-days/${dayId}/`, { method: "DELETE" });
}

export async function saveLateness(
  session: StaffSession,
  input: { group: number; student: number; date: string; slot?: number; minutes: number }
) {
  const date = normDate(input.date);
  const slot = input.slot ?? 0;
  const existing = await api<LatenessRecord[]>(session, `/v0/lateness/?group=${input.group}`);
  const match = existing.ok
    ? existing.data.find(
        (l) => l.student === input.student && normDate(l.date) === date && (l.slot ?? 0) === slot
      )
    : undefined;
  if (match?.id) {
    return api(session, `/v0/lateness/${match.id}/`, {
      method: "PATCH",
      body: JSON.stringify({ minutes: input.minutes }),
    });
  }
  return api(session, "/v0/lateness/", {
    method: "POST",
    body: JSON.stringify({ ...input, date, slot }),
  });
}
