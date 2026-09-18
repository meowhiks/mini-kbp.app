import { fetchKbpText } from "./kbpHttp.mjs";

const MAIN_URL = "https://kbp.by/rasp/timetable/view_beta_kbp/";

/** Карта «название группы» → id расписания на kbp.by */
export async function fetchKbpGroupTimetableMap() {
  const html = await fetchKbpText(MAIN_URL);
  const map = new Map();
  const linkMatches = html.matchAll(
    /<a[^>]*href="[^"]*\?page=stable&amp;cat=group&amp;id=(\d+)"[^>]*>([^<]+)<\/a>/g
  );
  for (const m of linkMatches) {
    const id = m[1];
    const name = m[2].trim();
    if (id && name) map.set(name, id);
  }
  return map;
}

/** Список групп с kbp.by (для справки / сидов) */
export async function fetchKbpGroups() {
  const map = await fetchKbpGroupTimetableMap();
  return Array.from(map.entries()).map(([name, id]) => ({ id, name }));
}

/** @deprecated use fetchKbpGroups */
export const fetchEjGroups = fetchKbpGroups;

export async function resolveKbpTimetableId(groupName, cacheMap) {
  if (cacheMap?.has(groupName)) return cacheMap.get(groupName);
  const map = cacheMap || (await fetchKbpGroupTimetableMap());
  return map.get(groupName) || null;
}
