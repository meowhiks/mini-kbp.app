/** Query-параметры расписания в URL: ?tt_type= & tt_id= & tt_name= */

export const TIMETABLE_QUERY_STORAGE_KEY = "timetable_query_v1";

export type TimetableEntityType = "group" | "teacher" | "place" | "subject";

export type TimetableQuery = {
  type?: TimetableEntityType;
  id?: string;
  name?: string;
};

const VALID_TYPES = new Set<TimetableEntityType>(["group", "teacher", "place", "subject"]);

export function parseTimetableQuery(search: URLSearchParams | string): TimetableQuery {
  const sp =
    typeof search === "string"
      ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
      : search;
  const rawType = sp.get("tt_type")?.trim() || "";
  const type = VALID_TYPES.has(rawType as TimetableEntityType) ? (rawType as TimetableEntityType) : undefined;
  const id = sp.get("tt_id")?.trim() || undefined;
  const name = sp.get("tt_name")?.trim() || undefined;
  return { type, id, name };
}

export function timetableQueryKey(type: string, id: string): string {
  return `${type}:${id}`;
}

export function normalizeTimetableEntityName(value: string): string {
  return value
    .toLowerCase()
    .replace(/^ауд\.\s*/i, "")
    .replace(/\s+/g, "")
    .replace(/[.,_()\-]/g, "")
    .trim();
}

export function matchTimetableEntityId(
  items: Array<{ type: string; id: string; name: string }>,
  type: string,
  name: string
): string | undefined {
  const target = normalizeTimetableEntityName(name);
  if (!target) return undefined;
  const sameType = items.filter((it) => it.type === type);
  const exact = sameType.find((it) => normalizeTimetableEntityName(it.name) === target);
  if (exact?.id) return exact.id;
  return sameType.find((it) => normalizeTimetableEntityName(it.name).startsWith(target))?.id;
}

export function hasTimetableEntity(
  query: TimetableQuery
): query is TimetableQuery & { type: TimetableEntityType; id: string } {
  return Boolean(query.type && query.id);
}

/** URL (или сохранённый query) важнее кэша прошлой сущности. */
export function cachedTimetableMatchesQuery(
  cached: { type?: string; id?: string } | null | undefined,
  query: TimetableQuery
): boolean {
  if (!hasTimetableEntity(query)) return true;
  if (!cached?.type || cached.id == null || cached.id === "") return false;
  return cached.type === query.type && String(cached.id) === String(query.id);
}

export function isTimetableQueryNavigable(query: TimetableQuery): boolean {
  return Boolean(query.type && (query.id || query.name));
}

export function preferTimetableQuery(fromUrl: TimetableQuery, fromStore: TimetableQuery | null): TimetableQuery {
  if (isTimetableQueryNavigable(fromUrl)) return fromUrl;
  if (fromStore && isTimetableQueryNavigable(fromStore)) return fromStore;
  return fromUrl;
}

export function buildTimetableSearchParams(
  base: URLSearchParams,
  query: TimetableQuery
): URLSearchParams {
  const next = new URLSearchParams(base.toString());
  if (query.type && (query.id || query.name)) {
    next.set("page", "timetable");
    next.set("tt_type", query.type);
    if (query.id) next.set("tt_id", query.id);
    else next.delete("tt_id");
    if (query.name) next.set("tt_name", query.name);
    else next.delete("tt_name");
  } else {
    next.delete("tt_type");
    next.delete("tt_id");
    next.delete("tt_name");
  }
  return next;
}

/** Ссылка на сущность расписания: /path?page=timetable&tt_type=&tt_id=&tt_name= */
export function buildTimetableEntityHref(
  query: { type?: TimetableEntityType; id?: string; name?: string },
  pathname = ""
): string | null {
  if (!query.type || (!query.id && !query.name)) return null;
  const sp = new URLSearchParams();
  sp.set("page", "timetable");
  sp.set("tt_type", query.type);
  if (query.id) sp.set("tt_id", query.id);
  if (query.name) sp.set("tt_name", query.name);
  const qs = sp.toString();
  const path = pathname || "";
  return path ? `${path}?${qs}` : `?${qs}`;
}
