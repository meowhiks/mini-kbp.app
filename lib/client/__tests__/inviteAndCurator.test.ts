import { describe, expect, it } from "vitest";
import { inviteStepCopy } from "@/lib/client/inviteStepCopy";
import { curatorOwnedGroups } from "@/lib/client/curatorOwnedGroups";

describe("inviteStepCopy", () => {
  it("explains that an invitation login code is required", () => {
    const copy = inviteStepCopy();
    expect(copy.title).toBe("Вход по приглашению");
    expect(copy.body.toLowerCase()).toContain("приглаш");
    expect(copy.placeholder).toBe("Код приглашения");
  });
});

describe("curatorOwnedGroups", () => {
  const groups = [
    { id: 1, name: "ИС-21" },
    { id: 2, name: "ИС-22" },
  ];

  it("keeps only groups the teacher curates", () => {
    expect(
      curatorOwnedGroups(groups, [{ teacher: 9, group: 2 }], 9).map((g) => g.id)
    ).toEqual([2]);
  });

  it("returns nothing without a teacher id", () => {
    expect(curatorOwnedGroups(groups, [{ teacher: 9, group: 2 }], undefined)).toEqual([]);
  });
});
