import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  emptyLockState,
  formatCountdown,
  isValidPin,
  msUntilUnlock,
  parseJournalScreenLock,
  unlockAtForDuration,
  hashPin,
  verifyPin,
  createSalt,
} from "@/lib/client/journalScreenLock";

describe("journalScreenLock", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", {
      getRandomValues: (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = i + 1;
        return arr;
      },
      subtle: {
        digest: async (_algo: string, data: BufferSource) => {
          const bytes = new Uint8Array(
            ArrayBuffer.isView(data)
              ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
              : data
          );
          const out = new Uint8Array(32);
          let h = 2166136261;
          for (let i = 0; i < bytes.length; i++) {
            h ^= bytes[i];
            h = Math.imul(h, 16777619);
            out[i % 32] ^= (h >>> (i % 24)) & 0xff;
          }
          out[0] ^= bytes.length & 0xff;
          out[1] ^= bytes[0] ?? 0;
          out[2] ^= bytes[bytes.length - 1] ?? 0;
          return out.buffer;
        },
      },
    });
  });

  it("validates pin length", () => {
    expect(isValidPin("1234")).toBe(true);
    expect(isValidPin("12345678")).toBe(true);
    expect(isValidPin("123")).toBe(false);
    expect(isValidPin("12ab")).toBe(false);
  });

  it("parses lock state and clears on teacher mismatch", () => {
    const raw = { teacherId: 1, pinHash: "abc", salt: "s", unlockAt: 10, locked: true };
    expect(parseJournalScreenLock(raw, 1).locked).toBe(true);
    expect(parseJournalScreenLock(raw, 2)).toEqual(emptyLockState(2));
  });

  it("computes unlockAt and countdown", () => {
    const now = Date.UTC(2026, 0, 1, 12, 0, 0);
    expect(unlockAtForDuration(15, now) - now).toBe(15 * 60_000);
    const eod = unlockAtForDuration(null, now);
    expect(eod).toBeGreaterThan(now);
    expect(eod - now).toBeLessThanOrEqual(24 * 60 * 60_000);
    expect(msUntilUnlock(now + 5000, now)).toBe(5000);
    expect(msUntilUnlock(now - 1, now)).toBe(0);
    expect(formatCountdown(65_000)).toBe("01:05");
    expect(formatCountdown(3_665_000)).toBe("1:01:05");
  });

  it("parses custom lock minutes", async () => {
    const { parseCustomLockMinutes } = await import("@/lib/client/journalScreenLock");
    expect(parseCustomLockMinutes("25")).toBe(25);
    expect(parseCustomLockMinutes("0")).toBe(null);
    expect(parseCustomLockMinutes("999")).toBe(null);
  });
});
