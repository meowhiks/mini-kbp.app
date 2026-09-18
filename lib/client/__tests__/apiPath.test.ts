import { describe, expect, it } from "vitest";
import { apiPath, apiUrl } from "@/lib/client/apiPath";

describe("apiPath", () => {
  it("maps leftover /api staff URLs onto /v0", () => {
    expect(apiPath("staff/students/7/app-profile/")).toBe("/v0/staff/students/7/app-profile/");
    expect(apiPath("/api/staff/students/7/app-profile/")).toBe("/v0/staff/students/7/app-profile/");
    expect(apiUrl("https://lk.mini-kbp.site", "group-curators/")).toBe(
      "https://lk.mini-kbp.site/v0/group-curators/"
    );
  });
});
