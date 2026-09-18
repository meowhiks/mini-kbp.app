const DB_NAME = "minikbp_kv";
const STORE = "kv";

function openKvDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbKvGet(key: string): Promise<string | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openKvDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => {
        const value = req.result;
        resolve(typeof value === "string" ? value : value == null ? null : JSON.stringify(value));
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function idbKvSet(key: string, value: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openKvDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // quota / private mode
  }
}

export async function idbKvRemove(key: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openKvDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}
