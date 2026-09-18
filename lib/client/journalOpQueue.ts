import type { JournalCommand } from "@/lib/client/journalCommands";

const DB_NAME = "minikbp_journal_ops";
const STORE = "ops";
const STORAGE_KEY = "journal_ops_v1";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readAllIdb(): Promise<JournalCommand[]> {
  if (typeof indexedDB === "undefined") return readAllLocal();
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return readAllLocal();
  }
}

async function writeAllIdb(ops: JournalCommand[]): Promise<void> {
  if (typeof indexedDB === "undefined") {
    writeAllLocal(ops);
    return;
  }
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      store.clear();
      for (const op of ops) store.put(op);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    writeAllLocal(ops);
  }
}

function readAllLocal(): JournalCommand[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAllLocal(ops: JournalCommand[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ops));
  } catch {
    // quota
  }
}

export async function enqueueJournalOp(command: JournalCommand): Promise<void> {
  const all = await readAllIdb();
  const next = [...all.filter((op) => op.id !== command.id), { ...command, status: "queued_offline" as const }];
  await writeAllIdb(next);
}

export async function listQueuedJournalOps(assignmentId?: number): Promise<JournalCommand[]> {
  const all = await readAllIdb();
  return assignmentId == null ? all : all.filter((op) => op.assignmentId === assignmentId);
}

export async function removeQueuedJournalOps(ids: string[]): Promise<void> {
  const drop = new Set(ids);
  const all = await readAllIdb();
  await writeAllIdb(all.filter((op) => !drop.has(op.id)));
}

export async function clearQueuedJournalOps(): Promise<void> {
  await writeAllIdb([]);
}

/** Sync API for callers that expect sync list (uses cached read). */
export function listQueuedJournalOpsSync(assignmentId?: number): JournalCommand[] {
  return readAllLocal().filter((op) => assignmentId == null || op.assignmentId === assignmentId);
}
