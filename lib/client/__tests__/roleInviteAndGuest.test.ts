import { describe, expect, it } from "vitest";
import { buildRoleInviteUrl, inviteCodeFromUrl, normalizeInviteCode } from "@/lib/client/roleInviteLink";
import { appNavItems } from "@/lib/client/appNavItems";

describe("roleInviteLink", () => {
  it("normalizes invite codes", () => {
    expect(normalizeInviteCode(" ab12cd ")).toBe("AB12CD");
  });

  it("builds login url with invite code", () => {
    const url = buildRoleInviteUrl("abc123", "https://lk.mini-kbp.site");
    expect(url).toBe("https://lk.mini-kbp.site/?invite=ABC123");
  });

  it("reads invite from query string", () => {
    expect(inviteCodeFromUrl("?do=register&invite=xy12ab")).toBe("XY12AB");
    expect(inviteCodeFromUrl("?invite=xy12ab")).toBe("XY12AB");
    expect(inviteCodeFromUrl("?invite=ab")).toBeUndefined();
  });
});

describe("appNavItems guest mode", () => {
  it("shows only settings and timetable for guests", () => {
    const items = appNavItems(null, { guestMode: true });
    expect(items.map((i) => ("id" in i ? i.id : i.kind))).toEqual([0, 1]);
    expect(items.map((i) => i.label)).toEqual(["Настройки", "Расписание"]);
  });
});
