import { describe, expect, it } from "vitest";
import { isAllowedAvatarFile, isAllowedDisplayName, isAllowedPhone } from "@/lib/client/profileFieldRules";

describe("profileFieldRules", () => {
  it("allows human names and rejects junk", () => {
    expect(isAllowedDisplayName("Иванов Иван")).toBe(true);
    expect(isAllowedDisplayName("User")).toBe(true);
    expect(isAllowedDisplayName("<script>")).toBe(false);
    expect(isAllowedDisplayName("http://evil")).toBe(false);
    expect(isAllowedDisplayName("Name123")).toBe(false);
  });

  it("allows empty or phone-like numbers", () => {
    expect(isAllowedPhone("")).toBe(true);
    expect(isAllowedPhone("+375291112233")).toBe(true);
    expect(isAllowedPhone("not-a-phone-!!!abc")).toBe(false);
  });

  it("accepts image files only", () => {
    expect(isAllowedAvatarFile({ type: "image/png", name: "a.png" })).toBe(true);
    expect(isAllowedAvatarFile({ type: "image/jpeg", name: "a.jpg" })).toBe(true);
    expect(isAllowedAvatarFile({ type: "image/svg+xml", name: "a.svg" })).toBe(false);
    expect(isAllowedAvatarFile({ type: "application/pdf", name: "a.pdf" })).toBe(false);
  });
});
