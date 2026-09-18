import { describe, expect, it } from "vitest";
import { appNavItems } from "@/lib/client/appNavItems";

describe("appNavItems", () => {
  it("keeps two cabinet tabs for students and teachers", () => {
    expect(appNavItems(null)).toHaveLength(2);
    expect(appNavItems("student")).toHaveLength(2);
    expect(appNavItems("teacher").some((item) => item.kind === "panel")).toBe(false);
    expect(appNavItems(null).some((item) => item.kind === "tab" && item.label === "Журнал")).toBe(false);
    expect(appNavItems(null).some((item) => item.kind === "tab" && item.label === "Профиль")).toBe(false);
  });

  it("adds an admin panel tab for administrators on the web", () => {
    const items = appNavItems("admin");
    expect(items).toHaveLength(3);
    expect(items.at(-1)).toEqual({
      kind: "panel",
      label: "Панель администратора",
      icon: "panel",
    });
  });

  it("hides the admin panel tab in Capacitor", () => {
    expect(appNavItems("admin", { hideAdminPanel: true }).some((item) => item.kind === "panel")).toBe(false);
  });
});
