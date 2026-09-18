import { describe, expect, it } from "vitest";
import { unauthenticatedStaffLocation } from "@/lib/client/lkAppUrl";

describe("unauthenticatedStaffLocation", () => {
  it("sends panel visitors to the cabinet login instead of a 403 page", () => {
    expect(unauthenticatedStaffLocation("panel.mini-kbp.site")).toBe("https://lk.mini-kbp.site/");
  });

  it("keeps local staff pages on /app", () => {
    expect(unauthenticatedStaffLocation("localhost")).toBe("/app");
  });
});
