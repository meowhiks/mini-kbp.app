import { getKbpPairTime } from "@/lib/client/kbpBellSchedule";
import { kbpRequestText } from "@/lib/client/kbpRequest";
import { getServerUrl } from "@/lib/client/serverUrl";
import {
  getGroups,
  login,
  getCachedJournal,
  getCachedFIO,
  getStudentSession,
  clearStudentSession,
  journalDataNeedsKindRefresh,
  type Group,
  type JournalData,
  type LatenessData,
} from "@/lib/client/studentApi";
import { storageGet, storageSet } from "@/lib/client/storage";

export type { Group, JournalData, LatenessData };
export {
  getGroups,
  login,
  getCachedJournal,
  getCachedFIO,
  getStudentSession,
  clearStudentSession,
  journalDataNeedsKindRefresh,
};

export type JournalMark = { value: string; type: string; kind?: "normal" | "alert" };
export type LatenessMark = { value: string; type: string };

const STORAGE_KEYS = {
  TIMETABLE_DATA: "cached_timetable_data",
  LAST_TIMETABLE_FETCH: "last_timetable_fetch",
} as const;
export function journalMarkAlertStyle(kind?: "normal" | "alert"): {
  color?: string;
  fontWeight?: number;
} {
  if (kind === "alert") return { color: "#dc2626", fontWeight: 700 };
  return {};
}

export async function getCachedLateness(): Promise<LatenessData | null> {
  const cached = await storageGet("cached_lateness_data");
  if (!cached) return null;
  try {
    return JSON.parse(cached);
  } catch {
    return null;
  }
}

async function reloginFromSaved(): Promise<boolean> {
  const { getKbpLoginData } = await import("@/lib/client/kbpStorageKeys");
  const raw = await getKbpLoginData();
  if (!raw) return false;
  try {
    const d = JSON.parse(raw) as { student_name?: string; group_id?: string; birth_day?: string };
    if (!d.student_name || !d.group_id || !d.birth_day) return false;
    const r = await login({
      student_name: d.student_name,
      group_id: d.group_id,
      birth_day: d.birth_day,
    });
    return r.success;
  } catch {
    return false;
  }
}

export async function fetchJournal(): Promise<{
  success: boolean;
  data?: JournalData;
  error?: string;
}> {
  let r = await fetchJournalApi();
  if (!r.ok && (r.detail.includes("401") || r.detail.includes("403") || r.detail.includes("авториз"))) {
    if (await reloginFromSaved()) {
      r = await fetchJournalApi();
    }
  }
  if (!r.ok) {
    const cached = await getCachedJournal();
    if (cached) return { success: true, data: cached };
    return { success: false, error: r.detail };
  }
  await storageSet("cached_journal_data", JSON.stringify(r.data));
  await storageSet("last_journal_fetch", Date.now().toString());
  return { success: true, data: r.data };
}

async function fetchJournalApi() {
  const session = await getStudentSession();
  if (!session) return { ok: false as const, detail: "Не выполнен вход" };
  const base = session.serverUrl || getServerUrl();
  if (!base) return { ok: false as const, detail: "NEXT_PUBLIC_MINIKBP_SERVER_URL не задан" };
  try {
    const { fetchWithAuthRetry } = await import("@/lib/client/tokenRefresh");
    const res = await fetchWithAuthRetry(`${base}/v0/student/journal/`, {
      token: session.access,
      headers: { Authorization: `Bearer ${session.access}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = typeof body?.detail === "string" ? body.detail : `Ошибка ${res.status}`;
      if (res.status === 401) {
        const { handleInvalidToken } = await import("@/lib/client/authSessionGuard");
        handleInvalidToken(res.status, detail, true);
      }
      return {
        ok: false as const,
        detail,
      };
    }
    return { ok: true as const, data: body as JournalData };
  } catch {
    return { ok: false as const, detail: "Сервер недоступен" };
  }
}

export async function fetchLateness(): Promise<{
  success: boolean;
  data?: LatenessData;
  error?: string;
}> {
  let r = await fetchLatenessApi();
  if (!r.ok && (r.detail.includes("401") || r.detail.includes("403"))) {
    if (await reloginFromSaved()) r = await fetchLatenessApi();
  }
  if (!r.ok) {
    const cached = await getCachedLateness();
    if (cached) return { success: true, data: cached };
    return { success: false, error: r.detail };
  }
  await storageSet("cached_lateness_data", JSON.stringify(r.data));
  await storageSet("last_lateness_fetch", Date.now().toString());
  return { success: true, data: r.data };
}

async function fetchLatenessApi() {
  const session = await getStudentSession();
  if (!session) return { ok: false as const, detail: "Не выполнен вход" };
  const base = session.serverUrl || getServerUrl();
  if (!base) return { ok: false as const, detail: "NEXT_PUBLIC_MINIKBP_SERVER_URL не задан" };
  try {
    const { fetchWithAuthRetry } = await import("@/lib/client/tokenRefresh");
    const res = await fetchWithAuthRetry(`${base}/v0/student/lateness/`, {
      token: session.access,
      headers: { Authorization: `Bearer ${session.access}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = typeof body?.detail === "string" ? body.detail : `Ошибка ${res.status}`;
      if (res.status === 401) {
        const { handleInvalidToken } = await import("@/lib/client/authSessionGuard");
        handleInvalidToken(res.status, detail, true);
      }
      return {
        ok: false as const,
        detail,
      };
    }
    return { ok: true as const, data: body as LatenessData };
  } catch {
    return { ok: false as const, detail: "Сервер недоступен" };
  }
}

export async function fetchStudentFIO(): Promise<{ success: boolean; fio?: string; error?: string }> {
  const fio = await getCachedFIO();
  return fio ? { success: true, fio } : { success: false, error: "FIO not found" };
}

export async function fetchTimetable(groupId: string): Promise<{ success: boolean; data?: any; error?: string; fromCache?: boolean }> {
  console.log("[KBP] fetchTimetable called for group:", groupId);

  const fallbackCached = async () => {
    const cached = await getCachedTimetable();
    if (cached) return { success: true as const, data: cached, fromCache: true as const };
    return null;
  };

  try {
    // 1) get group name by id from ej login page (same mapping as web)
    const groups = await getGroups();
    const userGroup = groups.find((g) => g.id === groupId);
    if (!userGroup) {
      const cached = await fallbackCached();
      if (cached) return cached;
      return { success: false, error: `Group with ID ${groupId} not found` };
    }

    // 2) parse timetable group id from main timetable page
    const main = await kbpRequestText({
      url: "https://kbp.by/rasp/timetable/view_beta_kbp/",
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ru,en;q=0.9",
        "Cache-Control": "no-cache",
      },
    });
    if (main.status === 403) {
      const cached = await fallbackCached();
      if (cached) return cached;
      return { success: false, error: "KBP_403" };
    }

    const groupMap: Record<string, string> = {};
    const linkMatches = main.data.matchAll(
      /<a[^>]*href="[^"]*\?page=stable&amp;cat=group&amp;id=(\d+)"[^>]*>([^<]+)<\/a>/g
    );
    for (const m of linkMatches) {
      const timetableId = m[1];
      const groupName = m[2].trim();
      if (timetableId && groupName) groupMap[groupName] = timetableId;
    }

    const timetableId = groupMap[userGroup.name];
    if (!timetableId) {
      const cached = await fallbackCached();
      if (cached) return cached;
      return { success: false, error: `Group ${userGroup.name} not found in timetable` };
    }

    // 3) fetch timetable page + parse
    const page = await kbpRequestText({
      url: `https://kbp.by/rasp/timetable/view_beta_kbp/?page=stable&cat=group&id=${timetableId}`,
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ru,en;q=0.9",
        "Cache-Control": "no-cache",
      },
    });
    if (page.status === 403) {
      const cached = await fallbackCached();
      if (cached) return cached;
      return { success: false, error: "KBP_403" };
    }

    const timetableData = parseTimetableHtml(page.data, timetableId, userGroup.name);

    // Save to storage before returning
    console.log("[KBP] Saving timetable data to storage");
    await storageSet(STORAGE_KEYS.TIMETABLE_DATA, JSON.stringify(timetableData));
    await storageSet(STORAGE_KEYS.LAST_TIMETABLE_FETCH, Date.now().toString());
    // URL расписания для Java BackgroundSyncWorker (нужен чтобы фоновый воркер знал куда ходить)
    await storageSet("cached_timetable_url",
      `https://kbp.by/rasp/timetable/view_beta_kbp/?page=stable&cat=group&id=${timetableId}`);

    return { success: true, data: timetableData };
  } catch (err) {
    console.error("[KBP] Error fetching timetable:", err);
    const cached = await getCachedTimetable();
    if (cached) return { success: true, data: cached, fromCache: true };
    return { success: false, error: String(err) };
  }
}

// Get cached timetable data
export async function getCachedTimetable(): Promise<any | null> {
  const cached = await storageGet(STORAGE_KEYS.TIMETABLE_DATA);
  if (!cached) return null;
  try {
    return JSON.parse(cached);
  } catch {
    return null;
  }
}

function getPairTime(pairNumber: number, dayIndex: number): { start: string; end: string } {
  return getKbpPairTime(pairNumber, dayIndex);
}

/** Парсинг HTML расписания КБП (left_week + понедельник из right_week) */
export function parseTimetableHtml(html: string, groupId: string, groupName: string): any {
  const data: any = {
    groupId,
    groupName,
    pairs: [],
    dayStartTimes: [
      { start: "", end: "" },
      { start: "", end: "" },
      { start: "", end: "" },
      { start: "", end: "" },
      { start: "", end: "" },
      { start: "", end: "" },
    ],
    dayReplacementStatus: [
      { label: "", hasChanges: false, noChanges: false, unknown: true },
      { label: "", hasChanges: false, noChanges: false, unknown: true },
      { label: "", hasChanges: false, noChanges: false, unknown: true },
      { label: "", hasChanges: false, noChanges: false, unknown: true },
      { label: "", hasChanges: false, noChanges: false, unknown: true },
      { label: "", hasChanges: false, noChanges: false, unknown: true },
    ],
  };

  const weekDays = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];

  const extractWeekBlock = (weekId: "left_week" | "right_week"): string | null => {
    if (weekId === "left_week") {
      return html.match(/<div[^>]*id=["']left_week["'][^>]*>([\s\S]*?)<div[^>]*id=["']right_week["']/i)?.[1] ?? null;
    }
    return html.match(/<div[^>]*id=["']right_week["'][^>]*>([\s\S]*)/i)?.[1] ?? null;
  };

  const extractScheduleTable = (weekBlock: string): string | null => {
    const m = weekBlock.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
    const content = m?.[1];
    return content && (content.includes("pair-number") || content.includes('day="')) ? content : null;
  };

  const parseWeekMeta = (weekBlock: string) => ({
    dateRange: weekBlock.match(/<p[^>]*class=["']date["'][^>]*>([^<]*)<\/p>/i)?.[1]?.trim() ?? "",
    weekLabel: weekBlock.match(/<p[^>]*class=["']today["'][^>]*>([^<]*)<\/p>/i)?.[1]?.trim() ?? "",
  });

  const parseZamenaForDays = (tableContent: string, dayIndices: number[]) => {
    const replacementRowMatch = tableContent.match(/<tr[^>]*class="[^"]*zamena[^"]*"[^>]*>([\s\S]*?)<\/tr>/i);
    if (!replacementRowMatch) return;
    const replacementCells = Array.from(replacementRowMatch[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi));
    for (let i = 0; i < dayIndices.length; i++) {
      const storeIndex = dayIndices[i];
      const cellContent = replacementCells[i + 1]?.[1] || "";
      const plain = cellContent.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const hasChanges = /показать\s+замены/i.test(plain);
      const noChanges = /нету?\s+замен/i.test(plain);
      if (!data.dayReplacementStatus[storeIndex]) {
        data.dayReplacementStatus[storeIndex] = { label: "", hasChanges: false, noChanges: false, unknown: true };
      }
      data.dayReplacementStatus[storeIndex] = {
        label: plain,
        hasChanges,
        noChanges,
        unknown: !hasChanges && !noChanges,
      };
    }
  };

  const segments: { content: string; weekOffset: number }[] = [];
  const leftBlock = extractWeekBlock("left_week");
  const rightBlock = extractWeekBlock("right_week");

  if (leftBlock) {
    const leftTable = extractScheduleTable(leftBlock);
    if (leftTable) {
      segments.push({ content: leftTable, weekOffset: 0 });
      data.currentWeek = parseWeekMeta(leftBlock);
      parseZamenaForDays(leftTable, [0, 1, 2, 3, 4, 5]);
    }
  }

  if (rightBlock) {
    const rightTable = extractScheduleTable(rightBlock);
    if (rightTable) {
      segments.push({ content: rightTable, weekOffset: 1 });
      data.nextWeekMonday = parseWeekMeta(rightBlock);
      data.hasNextWeekMonday = true;
      data.dayStartTimes.push({ start: "", end: "" });
      data.dayReplacementStatus.push({ label: "", hasChanges: false, noChanges: false, unknown: true });
      parseZamenaForDays(rightTable, [6]);
    }
  }

  if (segments.length === 0) {
    const rwIdx = html.search(/id=["']right_week["']/i);
    const tableMatches = Array.from(html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi));
    for (const match of tableMatches) {
      const content = match[1];
      if (!content.includes("pair-number") && !content.includes('day="')) continue;
      const full = match[0];
      const globalIdx = html.indexOf(full);
      if (globalIdx < 0) continue;
      if (segments.length === 0) {
        segments.push({ content, weekOffset: 0 });
        continue;
      }
      if (rwIdx >= 0 && globalIdx > rwIdx && content !== segments[0].content) {
        segments.push({ content, weekOffset: 1 });
        data.hasNextWeekMonday = true;
        data.nextWeekMonday = data.nextWeekMonday ?? { dateRange: "", weekLabel: "след. нед." };
        data.dayStartTimes.push({ start: "", end: "" });
        data.dayReplacementStatus.push({ label: "", hasChanges: false, noChanges: false, unknown: true });
        break;
      }
    }
  }

  if (segments.length === 0) return data;

  data.hasNextWeek = Boolean(data.hasNextWeekMonday);

  for (const seg of segments) {
    const tableContent = seg.content;
    const weekOffset = seg.weekOffset;

  const rowMatches = Array.from(tableContent.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g));
  for (const rowMatch of rowMatches) {
    const rowContent = rowMatch[1];
    const pairNumberMatch = rowContent.match(/<td[^>]*class="[^"]*number[^"]*"[^>]*>(\d+)<\/td>/);
    if (!pairNumberMatch) continue;
    const pairNumber = parseInt(pairNumberMatch[1]);

    const dayCells = Array.from(rowContent.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g));
    if (dayCells.length < 8) continue;

    for (let cellIndex = 1; cellIndex < dayCells.length - 1; cellIndex++) {
      const cellContent = dayCells[cellIndex][1];
      let dayIndex: number | null = null;

      const dayCommentMatch = cellContent.match(/<!--[^>]*day="(\d+)"[^>]*-->/);
      if (dayCommentMatch) {
        const dayFromComment = parseInt(dayCommentMatch[1]);
        if (dayFromComment >= 1 && dayFromComment <= 6) dayIndex = dayFromComment - 1;
      }
      if (dayIndex === null) {
        dayIndex = cellIndex - 1;
        if (dayIndex < 0 || dayIndex > 5) continue;
      }

      // right_week: только понедельник (колонка после субботы текущей недели)
      if (weekOffset === 1 && dayIndex !== 0) continue;

      if (cellContent.includes("empty-pair") && !cellContent.includes("pair")) continue;

      let pairStartIndex = 0;
      let iterations = 0;
      while (pairStartIndex < cellContent.length && iterations < 100) {
        iterations++;
        const pairStartMatch = cellContent.substring(pairStartIndex).match(/<div[^>]*class="([^"]*)"[^>]*>/i);
        if (!pairStartMatch) break;
        const pairStartPos = pairStartIndex + (pairStartMatch.index || 0);
        const pairClasses = pairStartMatch[1] || "";
        const pairTagStart = pairStartPos + pairStartMatch[0].length;

        if (!pairClasses.includes("pair")) {
          pairStartIndex = pairTagStart + 1;
          continue;
        }

        let depth = 1;
        let pos = pairTagStart;
        let pairEndPos = -1;
        let depthIterations = 0;
        while (pos < cellContent.length && depth > 0 && depthIterations < 1000) {
          depthIterations++;
          const nextDivOpen = cellContent.indexOf("<div", pos);
          const nextDivClose = cellContent.indexOf("<\/div>", pos);
          if (nextDivClose === -1) break;
          if (nextDivOpen !== -1 && nextDivOpen < nextDivClose) {
            depth++;
            pos = nextDivOpen + 4;
          } else {
            depth--;
            if (depth === 0) {
              pairEndPos = nextDivClose;
              break;
            }
            pos = nextDivClose + 6;
          }
        }
        if (pairEndPos === -1) {
          pairStartIndex = pairTagStart + 1;
          continue;
        }

        const pairContent = cellContent.substring(pairTagStart, pairEndPos);
        if (!pairContent.trim()) {
          pairStartIndex = pairEndPos + 6;
          continue;
        }

        const pairData: any = {
          pairNumber,
          day: dayIndex,
          dayName: weekDays[dayIndex],
          subject: "",
          teacher: "",
          room: "",
          group: "",
          refs: { teachers: [] as Array<{ id: string; name: string }> },
          status: "normal",
        };

        const subjectMatch = pairContent.match(
          /<div[^>]*class="[^"]*subject[^"]*"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i
        );
        if (subjectMatch) pairData.subject = subjectMatch[1].trim();
        const subjectRefMatch = pairContent.match(
          /<div[^>]*class="[^"]*subject[^"]*"[^>]*>[\s\S]*?<a[^>]*href="[^"]*\?cat=subject(?:&amp;|&)id=(\d+)[^"]*"[^>]*>([^<]+)<\/a>/i
        );
        if (subjectRefMatch?.[1]) {
          pairData.refs.subject = { id: subjectRefMatch[1], name: subjectRefMatch[2]?.trim() || pairData.subject };
        }

        const leftColumnStartMatch = pairContent.match(/<div[^>]*class="[^"]*left-column[^"]*"[^>]*>/i);
        if (leftColumnStartMatch) {
          const leftColumnStartPos = leftColumnStartMatch.index || 0;
          const leftColumnTagStart = leftColumnStartPos + leftColumnStartMatch[0].length;
          let depth = 1;
          let pos = leftColumnTagStart;
          let leftColumnEndPos = -1;
          let depthIterations = 0;
          while (pos < pairContent.length && depth > 0 && depthIterations < 100) {
            depthIterations++;
            const nextDivOpen = pairContent.indexOf("<div", pos);
            const nextDivClose = pairContent.indexOf("<\/div>", pos);
            if (nextDivClose === -1) break;
            if (nextDivOpen !== -1 && nextDivOpen < nextDivClose) {
              depth++;
              pos = nextDivOpen + 4;
            } else {
              depth--;
              if (depth === 0) {
                leftColumnEndPos = nextDivClose;
                break;
              }
              pos = nextDivClose + 6;
            }
          }
          if (leftColumnEndPos !== -1) {
            const leftColumnContent = pairContent.substring(leftColumnTagStart, leftColumnEndPos);
            const teacherDivMatches = leftColumnContent.matchAll(
              /<div[^>]*class="[^"]*teacher[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
            );
            const teachers: string[] = [];
            for (const teacherDivMatch of teacherDivMatches) {
              const teacherDivContent = teacherDivMatch[1];
              const teacherLinkMatches = teacherDivContent.matchAll(/<a[^>]*>([^<]+)<\/a>/gi);
              for (const teacherLinkMatch of teacherLinkMatches) {
                const teacher = teacherLinkMatch[1].trim();
                if (teacher && teacher !== "&nbsp;") teachers.push(teacher);
              }
              const teacherRefMatches = teacherDivContent.matchAll(
                /<a[^>]*href="[^"]*\?cat=teacher(?:&amp;|&)id=(\d+)[^"]*"[^>]*>([^<]*)<\/a>/gi
              );
              for (const teacherRefMatch of teacherRefMatches) {
                const id = teacherRefMatch[1];
                const name = (teacherRefMatch[2] || "").trim();
                if (id && name) pairData.refs.teachers.push({ id, name });
              }
            }
            pairData.teacher = teachers.join(", ");
          }
        }

        const rightColumnStartMatch = pairContent.match(/<div[^>]*class="[^"]*right-column[^"]*"[^>]*>/i);
        if (rightColumnStartMatch) {
          const rightColumnStartPos = rightColumnStartMatch.index || 0;
          const rightColumnTagStart = rightColumnStartPos + rightColumnStartMatch[0].length;
          let depth = 1;
          let pos = rightColumnTagStart;
          let rightColumnEndPos = -1;
          let depthIterations = 0;
          while (pos < pairContent.length && depth > 0 && depthIterations < 100) {
            depthIterations++;
            const nextDivOpen = pairContent.indexOf("<div", pos);
            const nextDivClose = pairContent.indexOf("<\/div>", pos);
            if (nextDivClose === -1) break;
            if (nextDivOpen !== -1 && nextDivOpen < nextDivClose) {
              depth++;
              pos = nextDivOpen + 4;
            } else {
              depth--;
              if (depth === 0) {
                rightColumnEndPos = nextDivClose;
                break;
              }
              pos = nextDivClose + 6;
            }
          }
          if (rightColumnEndPos !== -1) {
            const rightColumnContent = pairContent.substring(rightColumnTagStart, rightColumnEndPos);
            const placeDivMatch = rightColumnContent.match(/<div[^>]*class="[^"]*place[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
            if (placeDivMatch) {
              const placeDivContent = placeDivMatch[1];
              const placeLinkMatches = placeDivContent.matchAll(/<a[^>]*>([^<]+)<\/a>/gi);
              for (const placeLinkMatch of placeLinkMatches) {
                const room = placeLinkMatch[1].trim();
                if (room && room !== "&nbsp;") {
                  pairData.room = room;
                  break;
                }
              }
              const placeRefMatch = placeDivContent.match(
                /<a[^>]*href="[^"]*\?cat=place(?:&amp;|&)id=(\d+)[^"]*"[^>]*>([^<]+)<\/a>/i
              );
              if (placeRefMatch?.[1]) {
                pairData.refs.place = { id: placeRefMatch[1], name: placeRefMatch[2]?.trim() || pairData.room };
              }
            }
            const groupDivMatch = rightColumnContent.match(/<div[^>]*class="[^"]*group[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
            if (groupDivMatch) {
              const groupDivContent = groupDivMatch[1];
              const groupNameMatch = groupDivContent.match(/<a[^>]*>([^<]+)<\/a>/i);
              if (groupNameMatch?.[1]) pairData.group = groupNameMatch[1].trim();
              const groupRefMatch = groupDivContent.match(
                /<a[^>]*href="[^"]*\?cat=group(?:&amp;|&)id=(\d+)[^"]*"[^>]*>([^<]+)<\/a>/i
              );
              if (groupRefMatch?.[1]) {
                pairData.refs.group = { id: groupRefMatch[1], name: groupRefMatch[2]?.trim() || pairData.group };
              }
            }
          }
        }

        if (pairClasses.includes("added")) pairData.status = "added";
        else if (pairClasses.includes("replaced")) pairData.status = "replaced";
        else if (pairClasses.includes("removed")) pairData.status = "removed";
        else if (pairClasses.includes("cancelled")) pairData.status = "cancelled";

        if (pairData.subject) {
          pairData.weekOffset = weekOffset;
          if (weekOffset === 1) pairData.isNextWeekMonday = true;
          data.pairs.push(pairData);
        }
        pairStartIndex = pairEndPos + 6;
      }
    }
  }

  }

  const fillDayRange = (dayIndex: number, filter: (p: any) => boolean) => {
    const dayPairs = data.pairs.filter(filter);
    if (dayPairs.length === 0) return;
    const firstPair = dayPairs.reduce((min: any, p: any) => (p.pairNumber < min.pairNumber ? p : min), dayPairs[0]);
    const lastPair = dayPairs.reduce((max: any, p: any) => (p.pairNumber > max.pairNumber ? p : max), dayPairs[0]);
    const firstTime = getPairTime(firstPair.pairNumber, dayIndex === 6 ? 0 : dayIndex);
    const lastTime = getPairTime(lastPair.pairNumber, dayIndex === 6 ? 0 : dayIndex);
    data.dayStartTimes[dayIndex] = { start: firstTime.start, end: lastTime.end };
  };

  for (let dayIndex = 0; dayIndex < 6; dayIndex++) {
    fillDayRange(dayIndex, (p: any) => {
      if ((p.weekOffset ?? 0) !== 0) return false;
      if (p.day !== dayIndex) return false;
      const subjectTrimmed = (p.subject || "").trim();
      if (!subjectTrimmed || subjectTrimmed === "Урок снят") return false;
      if (p.status === "removed" || p.status === "cancelled") return false;
      return p.status === "added" || p.status === "normal" || p.status === "replaced" || !p.status;
    });
  }

  if (data.hasNextWeekMonday) {
    fillDayRange(6, (p: any) => {
      if ((p.weekOffset ?? 0) !== 1 || p.day !== 0) return false;
      const subjectTrimmed = (p.subject || "").trim();
      if (!subjectTrimmed || subjectTrimmed === "Урок снят") return false;
      if (p.status === "removed" || p.status === "cancelled") return false;
      return p.status === "added" || p.status === "normal" || p.status === "replaced" || !p.status;
    });
  }

  return data;
}