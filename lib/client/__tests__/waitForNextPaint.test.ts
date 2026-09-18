import { describe, expect, it } from "vitest";
import { waitForNextPaint } from "@/lib/client/mobileWebAuthLink";

describe("waitForNextPaint", () => {
  it("resolves after animation frames", async () => {
    await expect(waitForNextPaint()).resolves.toBeUndefined();
  });
});
