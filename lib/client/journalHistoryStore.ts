import type { JournalCommand, JournalCommandStore } from "@/lib/client/journalCommands";
import { emptyCommandStore } from "@/lib/client/journalCommands";
import { storageGetObject, storageSetObject } from "@/lib/client/storage";

const PREFIX = "journal_cmd_history_v1:";

export function journalHistoryStorageKey(assignmentId: number): string {
  return `${PREFIX}${assignmentId}`;
}

export async function loadJournalCommandHistory(assignmentId: number): Promise<JournalCommand[]> {
  const list = await storageGetObject<JournalCommand[]>(journalHistoryStorageKey(assignmentId));
  if (!Array.isArray(list)) return [];
  return list.filter((item) => item && typeof item.id === "string" && typeof item.type === "string");
}

export async function saveJournalCommandHistory(assignmentId: number, history: JournalCommand[]): Promise<void> {
  await storageSetObject(journalHistoryStorageKey(assignmentId), history);
}

export async function hydrateCommandStore(assignmentId: number): Promise<JournalCommandStore> {
  const history = await loadJournalCommandHistory(assignmentId);
  return { ...emptyCommandStore(), history };
}
