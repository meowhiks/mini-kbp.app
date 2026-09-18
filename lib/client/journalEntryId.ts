import { getAppSession } from "@/lib/client/appAuth";
import { getKbpLoginData } from "@/lib/client/kbpStorageKeys";
import { journalArchiveId } from "@/lib/client/offlineArchive";
import { getStudentSession } from "@/lib/client/studentApi";

/** Стабильный ID журнала для аккаунта /app (один журнал на пользователя). */
export function appAccountJournalEntryId(groupId: string, studentId: number): string {
  return `app:${String(groupId).trim()}:${studentId}`;
}

export function isAppAccountJournalEntryId(id: string): boolean {
  return id.startsWith("app:");
}

/** ID активной записи журнала для текущей сессии. */
export async function resolveActiveJournalEntryId(): Promise<string | null> {
  const appSession = await getAppSession();
  if (appSession?.groupId && appSession.studentId) {
    return appAccountJournalEntryId(appSession.groupId, appSession.studentId);
  }

  const loginRaw = await getKbpLoginData();
  if (loginRaw) {
    try {
      const loginParsed = JSON.parse(loginRaw) as { student_name?: string; group_id?: string };
      if (loginParsed.student_name && loginParsed.group_id) {
        return journalArchiveId(loginParsed.group_id, loginParsed.student_name);
      }
    } catch {
      /* ignore */
    }
  }

  const session = await getStudentSession();
  const groupId = session?.groupId;
  const fullName = session?.fullName || "";
  if (!groupId || !fullName) return null;
  const surnamePart = fullName.split(/\s+/)[0] || fullName;
  return journalArchiveId(String(groupId), surnamePart);
}
