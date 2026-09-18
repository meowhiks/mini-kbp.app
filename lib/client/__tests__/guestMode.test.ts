import { afterEach, describe, expect, it, vi } from "vitest";

describe("guestMode for bundled shells", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("does not enable guest mode in a plain browser", async () => {
    const set = vi.fn(async () => undefined);
    vi.doMock("@/lib/client/platform", () => ({
      isBundledAppShell: () => false,
    }));
    vi.doMock("@/lib/client/storage", () => ({
      storageGet: async () => "1",
      storageSet: set,
      storageRemove: async () => undefined,
    }));

    const { isGuestModeActive, enableGuestMode } = await import("@/lib/client/guestMode");
    expect(await isGuestModeActive()).toBe(false);
    await enableGuestMode();
    expect(set).not.toHaveBeenCalled();
  });

  it("enables and reads guest mode in Electron shell", async () => {
    vi.doMock("@/lib/client/platform", () => ({
      isBundledAppShell: () => true,
    }));
    const store = new Map<string, string>();
    vi.doMock("@/lib/client/storage", () => ({
      storageGet: async (k: string) => store.get(k) ?? null,
      storageSet: async (k: string, v: string) => {
        store.set(k, v);
      },
      storageRemove: async (k: string) => {
        store.delete(k);
      },
    }));

    const { isGuestModeActive, enableGuestMode, clearGuestMode } = await import(
      "@/lib/client/guestMode"
    );
    expect(await isGuestModeActive()).toBe(false);
    await enableGuestMode();
    expect(await isGuestModeActive()).toBe(true);
    await clearGuestMode();
    expect(await isGuestModeActive()).toBe(false);
  });
});
