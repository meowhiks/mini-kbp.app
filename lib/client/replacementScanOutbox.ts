/** Локальный outbox фото листов замен (офлайн → отправка). */

import { storageGet, storageRemove, storageSet } from "@/lib/client/storage";

const OUTBOX_KEY = "replacement_scan_outbox_v1";

export type ReplacementScanOutboxItem = {
  id: string;
  createdAt: string;
  /** data URL */
  dataUrl: string;
  name: string;
};

export async function loadReplacementScanOutbox(): Promise<ReplacementScanOutboxItem[]> {
  const raw = await storageGet(OUTBOX_KEY);
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as ReplacementScanOutboxItem[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function saveReplacementScanOutbox(items: ReplacementScanOutboxItem[]): Promise<void> {
  await storageSet(OUTBOX_KEY, JSON.stringify(items));
}

export async function addReplacementScanPhotos(files: File[]): Promise<ReplacementScanOutboxItem[]> {
  const existing = await loadReplacementScanOutbox();
  const added: ReplacementScanOutboxItem[] = [];
  for (const file of files) {
    const dataUrl = await readFileAsDataUrl(file);
    added.push({
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      dataUrl,
      name: file.name || "scan.jpg",
    });
  }
  const next = [...existing, ...added];
  await saveReplacementScanOutbox(next);
  return next;
}

export async function clearReplacementScanOutbox(): Promise<void> {
  await storageRemove(OUTBOX_KEY);
}

export async function removeReplacementScanItem(id: string): Promise<ReplacementScanOutboxItem[]> {
  const next = (await loadReplacementScanOutbox()).filter((x) => x.id !== id);
  await saveReplacementScanOutbox(next);
  return next;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

export async function outboxItemsToBlobs(items: ReplacementScanOutboxItem[]): Promise<Blob[]> {
  const blobs: Blob[] = [];
  for (const item of items) {
    const res = await fetch(item.dataUrl);
    blobs.push(await res.blob());
  }
  return blobs;
}
