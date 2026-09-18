export const ADMIN_AUTOSAVE_DELAY_MS = 550;
export const ADMIN_LIVE_RELOAD_MS = 8000;

export function fingerprintAdminRow(value: unknown): string {
  return JSON.stringify(value);
}

export function mergeAdminEditDrafts<TRow extends { id: number }, TDraft>(
  prev: Record<number, TDraft>,
  list: TRow[],
  dirtyIds: Set<number>,
  mapRow: (row: TRow) => TDraft
): Record<number, TDraft> {
  const next: Record<number, TDraft> = { ...prev };
  const liveIds = new Set(list.map((row) => row.id));
  for (const row of list) {
    if (dirtyIds.has(row.id)) continue;
    next[row.id] = mapRow(row);
  }
  for (const key of Object.keys(next)) {
    const id = Number(key);
    if (!liveIds.has(id) && !dirtyIds.has(id)) {
      delete next[id];
    }
  }
  return next;
}

type Timer = ReturnType<typeof setTimeout>;

export function createAutosaveScheduler(delayMs = ADMIN_AUTOSAVE_DELAY_MS) {
  const timers = new Map<number, Timer>();
  const lastSaved = new Map<number, string>();
  const pending = new Set<number>();

  const cancelId = (id: number) => {
    const timer = timers.get(id);
    if (timer) clearTimeout(timer);
    timers.delete(id);
    pending.delete(id);
  };

  return {
    pendingIds: pending,
    markSaved(id: number, payload: unknown) {
      lastSaved.set(id, fingerprintAdminRow(payload));
    },
    schedule(id: number, payload: unknown, save: () => void, delay = delayMs) {
      const fp = fingerprintAdminRow(payload);
      if (lastSaved.get(id) === fp) {
        cancelId(id);
        return;
      }
      const prev = timers.get(id);
      if (prev) clearTimeout(prev);
      pending.add(id);
      timers.set(
        id,
        setTimeout(() => {
          timers.delete(id);
          lastSaved.set(id, fp);
          save();
        }, delay)
      );
    },
    cancel(id?: number) {
      if (id != null) {
        cancelId(id);
        return;
      }
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      pending.clear();
    },
  };
}
