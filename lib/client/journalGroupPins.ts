import { storageGetObject, storageSetObject } from "@/lib/client/storage";

export const JOURNAL_PINNED_GROUPS_KEY = "journal_pinned_groups_v1";
export const JOURNAL_TODAY_GROUPS_KEY = "journal_today_groups_v1";

export type ManualPinsState = {
  teacherId: number | null;
  groupIds: number[];
};

export type TodayGroupsState = {
  date: string;
  groupIds: number[];
};

export type GroupPinMeta = {
  curatorIds: ReadonlySet<number>;
  manualIds: ReadonlySet<number>;
  todayIds: ReadonlySet<number>;
};

function asIdList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const out: number[] = [];
  const seen = new Set<number>();
  for (const item of value) {
    const n = typeof item === "number" ? item : Number(item);
    if (!Number.isFinite(n) || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

export function parseManualPins(raw: unknown, teacherId?: number | null): ManualPinsState {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const storedTeacher =
    typeof obj?.teacherId === "number"
      ? obj.teacherId
      : obj?.teacherId == null
        ? null
        : Number(obj.teacherId);
  const groupIds = asIdList(obj?.groupIds);
  if (teacherId != null && storedTeacher != null && storedTeacher !== teacherId) {
    return { teacherId, groupIds: [] };
  }
  return {
    teacherId: teacherId ?? (Number.isFinite(storedTeacher as number) ? (storedTeacher as number) : null),
    groupIds,
  };
}

export function parseTodayGroups(raw: unknown, today: string): TodayGroupsState {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const date = typeof obj?.date === "string" ? obj.date : "";
  if (date !== today) return { date: today, groupIds: [] };
  return { date: today, groupIds: asIdList(obj?.groupIds) };
}

export async function loadManualPins(teacherId?: number | null): Promise<ManualPinsState> {
  const raw = await storageGetObject<unknown>(JOURNAL_PINNED_GROUPS_KEY);
  return parseManualPins(raw, teacherId);
}

export async function saveManualPins(state: ManualPinsState): Promise<void> {
  await storageSetObject(JOURNAL_PINNED_GROUPS_KEY, {
    teacherId: state.teacherId,
    groupIds: [...state.groupIds],
  });
}

export async function loadTodayGroups(today: string): Promise<TodayGroupsState> {
  const raw = await storageGetObject<unknown>(JOURNAL_TODAY_GROUPS_KEY);
  return parseTodayGroups(raw, today);
}

export async function saveTodayGroups(state: TodayGroupsState): Promise<void> {
  await storageSetObject(JOURNAL_TODAY_GROUPS_KEY, {
    date: state.date,
    groupIds: [...state.groupIds],
  });
}

export async function markTodayGroup(groupId: number, today: string): Promise<TodayGroupsState> {
  const current = await loadTodayGroups(today);
  if (current.groupIds.includes(groupId)) return current;
  const next = { date: today, groupIds: [...current.groupIds, groupId] };
  await saveTodayGroups(next);
  return next;
}

export function toggleManualPin(groupIds: number[], groupId: number): number[] {
  return groupIds.includes(groupId)
    ? groupIds.filter((id) => id !== groupId)
    : [...groupIds, groupId];
}

export function pinRank(groupId: number, meta: GroupPinMeta): number {
  if (meta.curatorIds.has(groupId)) return 0;
  if (meta.todayIds.has(groupId)) return 1;
  if (meta.manualIds.has(groupId)) return 2;
  return 3;
}

export function sortGroupsForSubject<T extends { id: number; name: string }>(
  groups: T[],
  meta: GroupPinMeta
): T[] {
  return [...groups].sort((a, b) => {
    const ra = pinRank(a.id, meta);
    const rb = pinRank(b.id, meta);
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name, "ru");
  });
}

export function isPinnedGroup(groupId: number, meta: GroupPinMeta): boolean {
  return meta.curatorIds.has(groupId) || meta.manualIds.has(groupId);
}
