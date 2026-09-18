/**
 * Клиент Python-бэкенда MiniKBP (Django + JWT).
 * URL сервера — из NEXT_PUBLIC_MINIKBP_SERVER_URL (.env.local).
 */

const SESSION_KEY = "minikbp_staff_session_v1";

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export { getServerUrl } from "@/lib/client/serverUrl";

export type StaffRole = "teacher" | "admin";

export type StaffSession = {
  role: StaffRole;
  access: string;
  refresh: string;
  serverUrl: string;
  teacherId?: number;
  fullName?: string;
  username?: string;
  isSuperuser?: boolean;
};

export type GroupRecord = {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
  student_count?: number;
};

export type StudentRecord = {
  id: number;
  full_name: string;
  record_book_number: string;
  email: string;
  phone: string;
  is_active: boolean;
};

export type TeacherRecord = {
  id: number;
  username: string;
  full_name: string;
  email: string;
  phone: string;
  is_active: boolean;
};

export type SubjectRecord = {
  id: number;
  name: string;
  short_name: string;
  description: string;
  is_active: boolean;
  teacher_ids: number[];
};

export type EnrollmentRecord = {
  id: number;
  student: number;
  group: number;
  is_active: boolean;
  student_detail?: { id: number; full_name: string; record_book_number: string };
  group_detail?: { id: number; name: string };
};

export type TeachingAssignment = {
  id: number;
  teacher: number;
  group: number;
  subject: number;
  lesson_type: string;
  hours_per_week: number;
  semester: number;
  is_active: boolean;
  teacher_detail?: { id: number; full_name: string };
  group_detail?: { id: number; name: string };
  subject_detail?: { id: number; name: string; short_name?: string };
};

export type GradeRecord = {
  id: number;
  assignment: number;
  student: number;
  date: string;
  slot?: number;
  value: string;
  comment: string;
  student_detail?: { id: number; full_name: string; record_book_number: string };
};

export type GroupStudent = {
  id: number;
  full_name: string;
  record_book_number: string;
  enrolled_at: string;
};

import { getServerUrl } from "@/lib/client/serverUrl";

export async function loadStaffSession(): Promise<StaffSession | null> {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StaffSession;
    if (!parsed?.access || !parsed?.role) return null;
    parsed.serverUrl = parsed.serverUrl || getServerUrl();
    return parsed;
  } catch {
    return null;
  }
}

export async function saveStaffSession(session: StaffSession): Promise<void> {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export async function clearStaffSession(): Promise<void> {
  localStorage.removeItem(SESSION_KEY);
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; detail: string };

async function apiFetch<T>(
  baseUrl: string,
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<ApiResult<T>> {
  const { token, ...init } = options;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = normalizeBaseUrl(baseUrl);
  if (!url) {
    return {
      ok: false,
      status: 0,
      detail: "NEXT_PUBLIC_MINIKBP_SERVER_URL не задан в .env.local",
    };
  }

  try {
    const { fetchWithAuthRetry } = await import("@/lib/client/tokenRefresh");
    const resp = await fetchWithAuthRetry(`${url}${path}`, {
      ...init,
      headers,
      token,
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const detail =
        typeof body?.detail === "string"
          ? body.detail
          : typeof body?.non_field_errors?.[0] === "string"
            ? body.non_field_errors[0]
            : Object.entries(body)
                .map(([k, v]) => `${k}: ${Array.isArray(v) ? v[0] : v}`)
                .join("; ") || `Ошибка ${resp.status}`;
      if (token) {
        const { handleInvalidToken } = await import("@/lib/client/authSessionGuard");
        handleInvalidToken(resp.status, detail, true);
      }
      return { ok: false, status: resp.status, detail };
    }
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, status: 0, detail: "Сервер недоступен. Запустите Django: python manage.py runserver 8000" };
  }
}

function sessionApi<T>(
  session: StaffSession,
  path: string,
  options: RequestInit = {}
): Promise<ApiResult<T>> {
  return apiFetch<T>(session.serverUrl, path, { ...options, token: session.access });
}

export async function loginTeacher(
  username: string,
  password: string
): Promise<{ ok: true; session: StaffSession } | { ok: false; detail: string }> {
  const serverUrl = getServerUrl();
  const result = await apiFetch<{
    access: string;
    refresh: string;
    teacher_id: number;
    full_name: string;
  }>(serverUrl, "/v0/auth/login/", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  if (!result.ok) return { ok: false, detail: result.detail };
  const session: StaffSession = {
    role: "teacher",
    access: result.data.access,
    refresh: result.data.refresh,
    serverUrl,
    teacherId: result.data.teacher_id,
    fullName: result.data.full_name,
    username,
  };
  await saveStaffSession(session);
  return { ok: true, session };
}

export async function loginAdmin(
  username: string,
  password: string
): Promise<{ ok: true; session: StaffSession } | { ok: false; detail: string }> {
  const serverUrl = getServerUrl();
  const result = await apiFetch<{
    access: string;
    refresh: string;
    username: string;
    is_staff: boolean;
    is_superuser: boolean;
  }>(serverUrl, "/v0/auth/admin-login/", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  if (!result.ok) return { ok: false, detail: result.detail };
  const session: StaffSession = {
    role: "admin",
    access: result.data.access,
    refresh: result.data.refresh,
    serverUrl,
    username: result.data.username,
    isSuperuser: result.data.is_superuser,
  };
  await saveStaffSession(session);
  return { ok: true, session };
}

// ─── CRUD helpers ───────────────────────────────────────────────────────────

export async function fetchGroups(session: StaffSession) {
  const r = await sessionApi<GroupRecord[]>(session, "/v0/groups/");
  return r.ok ? r.data : [];
}

export async function createGroup(session: StaffSession, data: Partial<GroupRecord>) {
  return sessionApi<GroupRecord>(session, "/v0/groups/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateGroup(session: StaffSession, id: number, data: Partial<GroupRecord>) {
  return sessionApi<GroupRecord>(session, `/v0/groups/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteGroup(session: StaffSession, id: number) {
  return sessionApi<void>(session, `/v0/groups/${id}/`, { method: "DELETE" });
}

export async function fetchStudents(session: StaffSession) {
  const r = await sessionApi<StudentRecord[]>(session, "/v0/students/");
  return r.ok ? r.data : [];
}

export type AppAccountRecord = {
  id: number;
  label: string;
  email: string;
  nickname: string;
  display_name: string;
  phone: string;
  gender: string;
  info: string;
  avatar_url: string;
  group_id: number | null;
  group_name: string | null;
  has_teacher: boolean;
  has_student: boolean;
  auth_provider: "telegram" | "email" | "google" | "unknown";
  telegram_username: string;
  is_active: boolean;
  profile_locked: boolean;
  show_group: boolean;
  session_ttl_days: number;
  created_at: string | null;
  has_android_push: boolean;
  android_push_count: number;
};

export async function fetchAppAccounts(
  session: StaffSession,
  role: "teacher" | "student" | "any" = "any"
): Promise<AppAccountRecord[]> {
  const r = await sessionApi<AppAccountRecord[]>(session, `/v0/app-accounts/?role=${role}`);
  return r.ok ? r.data : [];
}

export async function fetchAppAccount(session: StaffSession, id: number) {
  return sessionApi<AppAccountRecord>(session, `/v0/app-accounts/${id}/`);
}

export type AppAccountUpdatePayload = {
  is_active?: boolean;
  display_name?: string;
  nickname?: string;
  phone?: string;
  gender?: string;
  info?: string;
  show_group?: boolean;
  profile_locked?: boolean;
  session_ttl_days?: number;
  group_id?: number | null;
};

export async function updateAppAccount(session: StaffSession, id: number, payload: AppAccountUpdatePayload) {
  return sessionApi<AppAccountRecord>(session, `/v0/app-accounts/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteAppAccount(session: StaffSession, id: number) {
  return sessionApi<void>(session, `/v0/app-accounts/${id}/`, { method: "DELETE" });
}

export async function deleteAppAccounts(session: StaffSession, ids: number[]) {
  return sessionApi<{ deleted: number; skipped: number }>(session, `/v0/app-accounts/`, {
    method: "DELETE",
    body: JSON.stringify({ ids }),
  });
}

export async function sendAppAccountPush(
  session: StaffSession,
  id: number,
  body: string,
  title = "Администратор"
): Promise<{ ok: true; sent: number; failed: number } | { ok: false; error: string }> {
  const r = await sessionApi<{ sent: number; failed: number }>(session, `/v0/app-accounts/${id}/push/`, {
    method: "POST",
    body: JSON.stringify({ title, body }),
  });
  if (!r.ok) return { ok: false, error: r.detail };
  return { ok: true, sent: r.data.sent ?? 0, failed: r.data.failed ?? 0 };
}

export type PushHealthInfo = {
  firebase_configured: boolean;
  devices_total: number;
  devices_active_android: number;
  devices_linked_android: number;
};

export async function fetchPushHealth(session: StaffSession): Promise<PushHealthInfo | null> {
  const r = await sessionApi<PushHealthInfo>(session, "/v0/push/health/");
  if (!r.ok) return null;
  return r.data;
}

export type GroupCuratorRecord = {
  id: number;
  teacher: number;
  group: number;
};

export async function fetchGroupCurators(session: StaffSession): Promise<GroupCuratorRecord[]> {
  const r = await sessionApi<GroupCuratorRecord[]>(session, "/v0/group-curators/");
  return r.ok ? r.data : [];
}

export async function deleteGroupCurator(session: StaffSession, id: number) {
  return sessionApi<void>(session, `/v0/group-curators/${id}/`, { method: "DELETE" });
}

export async function createStudent(
  session: StaffSession,
  data: Partial<StudentRecord> & { app_account_id?: number }
) {
  return sessionApi<StudentRecord>(session, "/v0/students/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateStudent(session: StaffSession, id: number, data: Partial<StudentRecord>) {
  return sessionApi<StudentRecord>(session, `/v0/students/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteStudent(
  session: StaffSession,
  id: number,
  data: { totp_code: string; confirm_name: string }
) {
  return sessionApi<void>(session, `/v0/students/${id}/`, {
    method: "DELETE",
    body: JSON.stringify(data),
  });
}

export async function impersonateStudent(session: StaffSession, id: number) {
  return sessionApi<{
    access: string;
    refresh: string;
    student_id: number;
    full_name: string;
    group_id: string;
    group_name: string;
  }>(session, `/v0/students/${id}/impersonate/`, { method: "POST" });
}

export async function resetStudentApp(session: StaffSession, id: number) {
  return sessionApi<{ ok: boolean }>(session, `/v0/students/${id}/reset-app/`, { method: "POST" });
}

export async function fetchTeachers(session: StaffSession) {
  const r = await sessionApi<TeacherRecord[]>(session, "/v0/teachers/");
  return r.ok ? r.data : [];
}

export async function createTeacher(
  session: StaffSession,
  data: { app_account_id: number; full_name?: string; email?: string } | {
    username: string;
    password: string;
    full_name: string;
    email?: string;
  }
) {
  return sessionApi<TeacherRecord>(session, "/v0/teachers/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateTeacher(session: StaffSession, id: number, data: Partial<TeacherRecord>) {
  return sessionApi<TeacherRecord>(session, `/v0/teachers/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteTeacher(session: StaffSession, id: number) {
  return sessionApi<void>(session, `/v0/teachers/${id}/`, { method: "DELETE" });
}

export type RoleInviteCodeRecord = {
  id: number;
  code: string;
  role: "student" | "teacher";
  group_id: string | null;
  group_name: string | null;
  kbp_teacher_id?: number | null;
  kbp_teacher_name?: string | null;
  kbp_teacher_kbp_id?: string | null;
  expires_at: string;
  max_uses: number;
  use_count: number;
  is_active: boolean;
  used_by_label: string | null;
  used_at: string | null;
  created_at: string;
};

export type KbpCatalogTeacher = {
  id: number;
  kbp_id: string;
  name: string;
  linked: boolean;
};

export async function fetchKbpCatalogTeachers(session: StaffSession, q?: string) {
  const params = new URLSearchParams();
  if (q?.trim()) params.set("q", q.trim());
  params.set("limit", "50");
  const r = await sessionApi<KbpCatalogTeacher[]>(
    session,
    `/v0/kbp-catalog/teachers/?${params.toString()}`
  );
  return r.ok ? r.data : [];
}

export async function fetchRoleInviteCodes(session: StaffSession, role?: "student" | "teacher") {
  const q = role ? `?role=${role}` : "";
  const r = await sessionApi<RoleInviteCodeRecord[]>(session, `/v0/role-invite-codes/${q}`);
  return r.ok ? r.data : [];
}

export async function createRoleInviteCode(
  session: StaffSession,
  data: {
    role: "student" | "teacher";
    group_id?: number;
    kbp_teacher_id?: number;
    expires_at?: string;
    expires_days?: number;
    max_uses?: number;
    count?: number;
  }
) {
  return sessionApi<RoleInviteCodeRecord | RoleInviteCodeRecord[]>(session, "/v0/role-invite-codes/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateRoleInviteCode(
  session: StaffSession,
  id: number,
  data: Partial<{
    is_active: boolean;
    max_uses: number;
    expires_at: string;
    expires_days: number;
    group_id: number;
  }>
) {
  return sessionApi<RoleInviteCodeRecord>(session, `/v0/role-invite-codes/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteRoleInviteCode(session: StaffSession, id: number) {
  return sessionApi<void>(session, `/v0/role-invite-codes/${id}/`, { method: "DELETE" });
}

export async function fetchSubjects(session: StaffSession) {
  const r = await sessionApi<SubjectRecord[]>(session, "/v0/subjects/");
  return r.ok ? r.data : [];
}

export async function createSubject(session: StaffSession, data: Partial<SubjectRecord>) {
  return sessionApi<SubjectRecord>(session, "/v0/subjects/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateSubject(session: StaffSession, id: number, data: Partial<SubjectRecord>) {
  return sessionApi<SubjectRecord>(session, `/v0/subjects/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteSubject(session: StaffSession, id: number) {
  return sessionApi<void>(session, `/v0/subjects/${id}/`, { method: "DELETE" });
}

export async function fetchEnrollments(session: StaffSession) {
  const r = await sessionApi<EnrollmentRecord[]>(session, "/v0/enrollments/");
  return r.ok ? r.data : [];
}

export async function createEnrollment(
  session: StaffSession,
  data: { student: number; group: number; is_active?: boolean }
) {
  return sessionApi<EnrollmentRecord>(session, "/v0/enrollments/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function createEnrollmentsBatch(session: StaffSession, group: number, studentIds: number[]) {
  return sessionApi<{
    created: number;
    reactivated: number;
    skipped: number;
    items: EnrollmentRecord[];
  }>(session, "/v0/enrollments/batch/", {
    method: "POST",
    body: JSON.stringify({ group, student_ids: studentIds }),
  });
}

export async function deleteEnrollment(session: StaffSession, id: number) {
  return sessionApi<void>(session, `/v0/enrollments/${id}/`, { method: "DELETE" });
}

export async function fetchMyAssignments(session: StaffSession): Promise<TeachingAssignment[]> {
  if (session.role !== "teacher" || !session.teacherId) return [];
  const r = await sessionApi<TeachingAssignment[]>(
    session,
    `/v0/assignments/by-teacher/${session.teacherId}/`
  );
  return r.ok ? r.data : [];
}

export async function fetchAllAssignments(session: StaffSession): Promise<TeachingAssignment[]> {
  const r = await sessionApi<TeachingAssignment[]>(session, "/v0/assignments/");
  return r.ok ? r.data : [];
}

export async function createAssignment(
  session: StaffSession,
  data: {
    teacher: number;
    group: number;
    subject: number;
    lesson_type: string;
    semester?: number;
    hours_per_week?: number;
  }
) {
  return sessionApi<TeachingAssignment>(session, "/v0/assignments/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateAssignment(
  session: StaffSession,
  id: number,
  data: Partial<{
    teacher: number;
    group: number;
    subject: number;
    lesson_type: string;
    semester: number;
    hours_per_week: number;
    is_active: boolean;
  }>
) {
  return sessionApi<TeachingAssignment>(session, `/v0/assignments/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteAssignment(session: StaffSession, id: number) {
  return sessionApi<void>(session, `/v0/assignments/${id}/`, { method: "DELETE" });
}

export async function fetchGroupStudents(session: StaffSession, groupId: number) {
  const r = await sessionApi<GroupStudent[]>(session, `/v0/groups/${groupId}/students/`);
  return r.ok ? r.data : [];
}

export async function fetchGradesByAssignment(session: StaffSession, assignmentId: number) {
  const r = await sessionApi<GradeRecord[]>(
    session,
    `/v0/grades/by-assignment/${assignmentId}/`
  );
  return r.ok ? r.data : [];
}

export async function upsertGrade(
  session: StaffSession,
  input: { assignment: number; student: number; date: string; value: string }
): Promise<{ ok: boolean; detail?: string }> {
  const existing = await sessionApi<GradeRecord[]>(
    session,
    `/v0/grades/?assignment=${input.assignment}&student=${input.student}`
  );
  const match = existing.ok
    ? existing.data.find((g) => g.date === input.date)
    : undefined;

  if (match) {
    const result = await sessionApi<GradeRecord>(session, `/v0/grades/${match.id}/`, {
      method: "PATCH",
      body: JSON.stringify({ value: input.value }),
    });
    return result.ok ? { ok: true } : { ok: false, detail: result.detail };
  }

  const result = await sessionApi<GradeRecord>(session, "/v0/grades/", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.ok ? { ok: true } : { ok: false, detail: result.detail };
}

export type JournalBackupRecord = {
  id: number;
  backup_date: string;
  created_at: string;
  uncompressed_bytes: number;
  compressed_bytes: number;
  compression_ratio_pct: number;
  stats: { grades?: number; journal_days?: number; lateness?: number };
};

export async function fetchJournalBackups(session: StaffSession) {
  const r = await sessionApi<JournalBackupRecord[]>(session, "/v0/journal-backups/");
  return r.ok ? r.data : [];
}

export async function requestJournalRestore(session: StaffSession, backupId: number) {
  return sessionApi<{
    pending_token: string;
    email: string;
    telegram_sent: boolean;
    backup_date: string;
  }>(session, `/v0/journal-backups/${backupId}/restore-request/`, { method: "POST", body: "{}" });
}

export async function confirmJournalRestore(
  session: StaffSession,
  backupId: number,
  data: { pending_token: string; email_code: string; totp_code: string }
) {
  return sessionApi<{ ok: boolean; backup_date: string; restored: Record<string, number> }>(
    session,
    `/v0/journal-backups/${backupId}/restore-confirm/`,
    { method: "POST", body: JSON.stringify(data) }
  );
}

export type AdminAnalyticsData = {
  period: { key: string; from: string; to: string };
  users: {
    total: number;
    students: number;
    teachers: number;
    registrations_today: number;
    registrations_week: number;
    registrations_month: number;
    active_today: number;
    active_week: number;
  };
  groups_count: number;
  grades: {
    count: number;
    average: number | null;
    count_prev: number;
    average_prev: number | null;
    count_delta_pct: number | null;
    average_delta_pct: number | null;
    series: { label: string; count: number; average: number | null }[];
  };
  registrations_series: { label: string; count: number }[];
  today: {
    grades_count: number;
    logins_count: number;
    top_groups: { id: number; name: string; grades_count: number }[];
    top_teachers: { id: number; name: string; grades_count: number }[];
    recent_grades: {
      at: string;
      teacher: string;
      student: string;
      value: string;
      subject: string;
      group: string;
    }[];
  };
  groups: {
    id: number;
    name: string;
    student_count: number;
    grades_count: number;
    average: number | null;
    teachers: string[];
  }[];
  group_detail: {
    id: number;
    name: string;
    grades_series: { label: string; count: number; average: number | null }[];
    subjects: { name: string; average: number | null; grades_count: number }[];
    teachers_activity: { name: string; grades_count: number }[];
  } | null;
};

export async function fetchAdminAnalytics(
  session: StaffSession,
  params: { period?: string; from?: string; to?: string; group_id?: number }
) {
  const q = new URLSearchParams();
  if (params.period) q.set("period", params.period);
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  if (params.group_id) q.set("group_id", String(params.group_id));
  const qs = q.toString() ? `?${q}` : "";
  return sessionApi<AdminAnalyticsData>(session, `/v0/admin/analytics/${qs}`);
}

// ─── Schedule replacements (OCR scan) ───────────────────────────────────────

export type ReplacementEventType = "NEW_LESSON" | "CANCELLATION" | "REPLACEMENT";

export type ReplacementDataBlock = {
  subject?: string | null;
  room?: string | null;
  teachers?: string[];
};

export type ReplacementEntryRecord = {
  id?: number;
  group_code: string;
  kbp_group_id?: number | null;
  kbp_group_kbp_id?: string | null;
  lesson_number: number;
  event_type: ReplacementEventType;
  replacement_data: ReplacementDataBlock;
  original_data: ReplacementDataBlock;
  sort_order?: number;
};

export type ReplacementBatchRecord = {
  id: number;
  date: string | null;
  day_of_week: string;
  signed_by: string;
  status: "draft" | "published";
  created_by_id?: number | null;
  ocr_meta?: Record<string, unknown>;
  published_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  entries?: ReplacementEntryRecord[];
  schedule_info?: {
    day_of_week?: string | null;
    date?: string | null;
    signed_by?: string | null;
  };
  replacements?: ReplacementEntryRecord[];
};

export async function fetchReplacementBatches(session: StaffSession) {
  const r = await sessionApi<ReplacementBatchRecord[]>(session, "/v0/replacements/");
  return r.ok ? r.data : [];
}

export async function fetchReplacementBatch(session: StaffSession, id: number) {
  return sessionApi<ReplacementBatchRecord>(session, `/v0/replacements/${id}/`);
}

export async function updateReplacementBatch(
  session: StaffSession,
  id: number,
  data: {
    date?: string | null;
    day_of_week?: string;
    signed_by?: string;
    entries?: ReplacementEntryRecord[];
  }
) {
  return sessionApi<ReplacementBatchRecord>(session, `/v0/replacements/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function publishReplacementBatch(session: StaffSession, id: number) {
  return sessionApi<ReplacementBatchRecord>(session, `/v0/replacements/${id}/publish/`, {
    method: "POST",
    body: "{}",
  });
}

export async function unpublishReplacementBatch(session: StaffSession, id: number) {
  return sessionApi<ReplacementBatchRecord>(session, `/v0/replacements/${id}/unpublish/`, {
    method: "POST",
    body: "{}",
  });
}

export async function importReplacementOcrJson(
  session: StaffSession,
  payload: unknown
) {
  return sessionApi<ReplacementBatchRecord>(session, "/v0/replacements/import/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function scanReplacementImages(
  session: StaffSession,
  files: Blob[]
): Promise<ApiResult<ReplacementBatchRecord>> {
  const url = normalizeBaseUrl(session.serverUrl);
  if (!url) {
    return { ok: false, status: 0, detail: "Server URL не задан" };
  }
  const form = new FormData();
  files.forEach((f, i) => {
    const name = f instanceof File ? f.name : `scan-${i + 1}.jpg`;
    form.append("images", f, name);
  });
  try {
    const { fetchWithAuthRetry } = await import("@/lib/client/tokenRefresh");
    const resp = await fetchWithAuthRetry(`${url}/v0/replacements/scan/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access}` },
      body: form,
      token: session.access,
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return {
        ok: false,
        status: resp.status,
        detail: String((body as { detail?: string }).detail || resp.statusText || "Ошибка"),
      };
    }
    return { ok: true, data: body as ReplacementBatchRecord };
  } catch (e) {
    return { ok: false, status: 0, detail: e instanceof Error ? e.message : "Сеть" };
  }
}
