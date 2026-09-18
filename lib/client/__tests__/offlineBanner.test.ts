import { describe, expect, it } from "vitest";
import { offlineBannerProgress, OFFLINE_BANNER_MS } from "@/lib/client/offlineBanner";

describe("offlineBannerProgress", () => {
  it("starts full and reaches zero at duration", () => {
    expect(offlineBannerProgress(0)).toBe(1);
    expect(offlineBannerProgress(OFFLINE_BANNER_MS)).toBe(0);
    expect(offlineBannerProgress(OFFLINE_BANNER_MS / 2)).toBe(0.5);
  });
});
