import { describe, expect, it } from "vitest";
import { APP_RELEASES, FEATURE_WORDS } from "@/lib/client/appDownloads";

describe("app downloads catalog", () => {
  it("lists current build first and archives by version", () => {
    expect(APP_RELEASES[0]?.channel).toBe("current");
    expect(APP_RELEASES.map((r) => r.version)).toEqual([
      "0.3.12",
      "0.2.172",
      "0.1.71",
      "0.1.49",
      "0.1.29",
    ]);
  });

  it("keeps landing feature chips to one word", () => {
    expect(FEATURE_WORDS.every((word) => !word.includes(" "))).toBe(true);
  });

  it("exposes desktop download hrefs for the current build", () => {
    const current = APP_RELEASES[0];
    expect(current.winHref).toContain("win");
    expect(current.linuxAppImageHref).toContain("AppImage");
    expect(current.linuxDebHref).toContain(".deb");
  });
});
