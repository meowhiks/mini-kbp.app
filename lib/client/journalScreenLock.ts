import { storageGetObject, storageSetObject } from "@/lib/client/storage";

export const JOURNAL_SCREEN_LOCK_KEY = "journal_screen_lock_v1";

export type JournalScreenLockState = {
  teacherId: number | null;
  pinHash: string;
  salt: string;
  unlockAt: number | null;
  locked: boolean;
};

export type LockDurationOption = {
  id: string;
  label: string;
  /** Preset minutes; null means custom (user enters minutes). */
  minutes: number | null;
  custom?: boolean;
};

export const JOURNAL_LOCK_DURATIONS: LockDurationOption[] = [
  { id: "1m", label: "1", minutes: 1 },
  { id: "2m", label: "2", minutes: 2 },
  { id: "3m", label: "3", minutes: 3 },
  { id: "5m", label: "5", minutes: 5 },
  { id: "10m", label: "10", minutes: 10 },
  { id: "15m", label: "15", minutes: 15 },
  { id: "20m", label: "20", minutes: 20 },
  { id: "30m", label: "30", minutes: 30 },
  { id: "custom", label: "Своё", minutes: null, custom: true },
];

/** Clamp custom duration: 1–240 minutes. */
export function parseCustomLockMinutes(raw: string): number | null {
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n) || n < 1 || n > 240) return null;
  return Math.floor(n);
}

export function emptyLockState(teacherId: number | null = null): JournalScreenLockState {
  return {
    teacherId,
    pinHash: "",
    salt: "",
    unlockAt: null,
    locked: false,
  };
}

export function parseJournalScreenLock(
  raw: unknown,
  teacherId?: number | null
): JournalScreenLockState {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!obj) return emptyLockState(teacherId ?? null);
  const storedTeacher =
    typeof obj.teacherId === "number"
      ? obj.teacherId
      : obj.teacherId == null
        ? null
        : Number(obj.teacherId);
  if (teacherId != null && storedTeacher != null && storedTeacher !== teacherId) {
    return emptyLockState(teacherId);
  }
  return {
    teacherId: teacherId ?? (Number.isFinite(storedTeacher as number) ? (storedTeacher as number) : null),
    pinHash: typeof obj.pinHash === "string" ? obj.pinHash : "",
    salt: typeof obj.salt === "string" ? obj.salt : "",
    unlockAt: typeof obj.unlockAt === "number" ? obj.unlockAt : null,
    locked: Boolean(obj.locked) && Boolean(obj.pinHash),
  };
}

export function isValidPin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin.trim());
}

export function unlockAtForDuration(minutes: number | null, now = Date.now()): number {
  if (minutes == null) {
    const d = new Date(now);
    d.setHours(24, 0, 0, 0);
    return d.getTime();
  }
  return now + minutes * 60_000;
}

export function msUntilUnlock(unlockAt: number | null, now = Date.now()): number {
  if (unlockAt == null) return 0;
  return Math.max(0, unlockAt - now);
}

export function formatCountdown(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function createSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toHex(bytes.buffer);
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin.trim()}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

export async function verifyPin(
  pin: string,
  state: Pick<JournalScreenLockState, "pinHash" | "salt">
): Promise<boolean> {
  if (!state.pinHash || !state.salt || !isValidPin(pin)) return false;
  const hash = await hashPin(pin, state.salt);
  return hash === state.pinHash;
}

export async function loadJournalScreenLock(
  teacherId?: number | null
): Promise<JournalScreenLockState> {
  const raw = await storageGetObject<unknown>(JOURNAL_SCREEN_LOCK_KEY);
  const state = parseJournalScreenLock(raw, teacherId);
  if (state.locked && state.unlockAt != null && state.unlockAt <= Date.now()) {
    const cleared = { ...state, locked: false, unlockAt: null };
    await saveJournalScreenLock(cleared);
    return cleared;
  }
  return state;
}

export async function saveJournalScreenLock(state: JournalScreenLockState): Promise<void> {
  await storageSetObject(JOURNAL_SCREEN_LOCK_KEY, state);
}

export async function startJournalLock(input: {
  teacherId: number | null;
  pin: string;
  minutes: number | null;
  now?: number;
}): Promise<JournalScreenLockState> {
  const pin = input.pin.trim();
  if (!isValidPin(pin)) throw new Error("PIN должен быть 4–8 цифр");
  const salt = createSalt();
  const pinHash = await hashPin(pin, salt);
  const state: JournalScreenLockState = {
    teacherId: input.teacherId,
    pinHash,
    salt,
    unlockAt: unlockAtForDuration(input.minutes, input.now ?? Date.now()),
    locked: true,
  };
  await saveJournalScreenLock(state);
  return state;
}

export async function expireJournalLock(
  teacherId?: number | null
): Promise<JournalScreenLockState> {
  const state = await loadJournalScreenLock(teacherId);
  if (!state.locked) return state;
  const next = { ...state, locked: false, unlockAt: null };
  await saveJournalScreenLock(next);
  return next;
}

export async function unlockJournalWithPin(
  pin: string,
  teacherId?: number | null
): Promise<{ ok: true; state: JournalScreenLockState } | { ok: false; state: JournalScreenLockState }> {
  const state = await loadJournalScreenLock(teacherId);
  if (!state.locked) return { ok: true, state };
  const match = await verifyPin(pin, state);
  if (!match) return { ok: false, state };
  const next = { ...state, locked: false, unlockAt: null };
  await saveJournalScreenLock(next);
  return { ok: true, state: next };
}

export async function clearJournalScreenLock(teacherId?: number | null): Promise<JournalScreenLockState> {
  const next = emptyLockState(teacherId ?? null);
  await saveJournalScreenLock(next);
  return next;
}
