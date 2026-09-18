import { afterEach, describe, expect, it, vi } from "vitest";

describe("getServerUrl bundled shells", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("uses lk origin for Electron when env is localhost", async () => {
    vi.stubEnv("NEXT_PUBLIC_MINIKBP_SERVER_URL", "http://127.0.0.1:8000");
    vi.stubGlobal("window", {
      location: { hostname: "bundle", protocol: "minikbp:", host: "bundle", port: "" },
    });
    vi.doMock("@/lib/client/platform", () => ({
      isBundledAppShell: () => true,
      isElectronDesktop: () => true,
      isNativeApp: () => false,
    }));

    const { getServerUrl } = await import("@/lib/client/serverUrl");
    expect(getServerUrl()).toBe("https://lk.mini-kbp.site");
  });

  it("uses lk origin for Capacitor when env is empty (api.* has no DNS)", async () => {
    vi.stubEnv("NEXT_PUBLIC_MINIKBP_SERVER_URL", "");
    vi.stubGlobal("window", {
      location: { hostname: "localhost", protocol: "https:", host: "localhost", port: "" },
    });
    vi.doMock("@/lib/client/platform", () => ({
      isBundledAppShell: () => true,
      isElectronDesktop: () => false,
      isNativeApp: () => true,
    }));

    const { getServerUrl } = await import("@/lib/client/serverUrl");
    expect(getServerUrl()).toBe("https://lk.mini-kbp.site");
  });
});
