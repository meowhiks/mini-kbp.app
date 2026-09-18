import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  clearMobileWebLinkSession,
  loadMobileWebLinkSession,
  saveMobileWebLinkSession,
} from "@/lib/client/mobileWebLinkSession";

describe("mobileWebLinkSession", () => {
  const mem = new Map<string, string>();

  beforeEach(() => {
    mem.clear();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
      removeItem: (k: string) => {
        mem.delete(k);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves and loads a session", async () => {
    await saveMobileWebLinkSession({ token: "t1", kind: "google", startedAt: Date.now() });
    const s = await loadMobileWebLinkSession();
    expect(s?.token).toBe("t1");
    expect(s?.kind).toBe("google");
  });

  it("clears session", async () => {
    await saveMobileWebLinkSession({ token: "t1", kind: "telegram", startedAt: Date.now() });
    await clearMobileWebLinkSession();
    expect(await loadMobileWebLinkSession()).toBeNull();
  });

  it("drops expired sessions", async () => {
    await saveMobileWebLinkSession({
      token: "old",
      kind: "site",
      startedAt: Date.now() - 400_000,
    });
    expect(await loadMobileWebLinkSession()).toBeNull();
  });
});
