import { describe, expect, it } from "vitest";
import { authLoginButtons } from "@/lib/client/authLoginButtons";

describe("authLoginButtons", () => {
  it("shows Telegram and Google on Capacitor (same as PC OAuth)", () => {
    expect(authLoginButtons({ native: true, electron: false, desktopBrowser: false })).toEqual({
      qrLogin: false,
      qrScan: false,
      telegram: true,
      google: true,
      siteNative: false,
    });
  });

  it("shows Telegram, Google and QR on desktop web", () => {
    expect(authLoginButtons({ native: false, electron: false, desktopBrowser: true })).toEqual({
      qrLogin: true,
      qrScan: false,
      telegram: true,
      google: true,
      siteNative: false,
    });
  });

  it("hides QR on mobile web but keeps Telegram and Google", () => {
    expect(authLoginButtons({ native: false, electron: false, desktopBrowser: false })).toEqual({
      qrLogin: false,
      qrScan: false,
      telegram: true,
      google: true,
      siteNative: false,
    });
  });
});
