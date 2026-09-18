import { describe, expect, it } from "vitest";
import { desktopWindowTitle } from "../../../desktop/windowChrome.js";

describe("desktopWindowTitle", () => {
  it("shows the admin panel title on panel.mini-kbp.site", () => {
    expect(desktopWindowTitle("panel.mini-kbp.site")).toBe("Панель администратора");
  });

  it("shows Mini KBP on the cabinet host", () => {
    expect(desktopWindowTitle("lk.mini-kbp.site")).toBe("Мини КБиП");
  });
});
