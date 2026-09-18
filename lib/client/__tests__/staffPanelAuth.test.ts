import { describe, expect, it } from "vitest";
import {
  getLkAppUrl,
  getLkLoginUrl,
  getPanelAppUrl,
  isApexHost,
  isPanelHost,
  PRODUCTION_HOME_ORIGIN,
} from "@/lib/client/lkAppUrl";

describe("hosts", () => {
  it("recognizes apex hosts that must redirect to lk", () => {
    expect(isApexHost("mini-kbp.site")).toBe(true);
    expect(isApexHost("www.mini-kbp.site")).toBe(true);
    expect(isApexHost("lk.mini-kbp.site")).toBe(false);
    expect(PRODUCTION_HOME_ORIGIN).toBe("https://lk.mini-kbp.site");
  });

  it("recognizes the staff panel host", () => {
    expect(isPanelHost("panel.mini-kbp.site")).toBe(true);
    expect(isPanelHost("lk.mini-kbp.site")).toBe(false);
  });

  it("builds prefix-free production URLs", () => {
    expect(getLkAppUrl()).toBe("https://lk.mini-kbp.site/");
    expect(getLkAppUrl("/app")).toBe("https://lk.mini-kbp.site/");
    expect(getLkAppUrl("/app/journal")).toBe("https://lk.mini-kbp.site/journal");
    expect(getLkAppUrl("/app?do=login")).toBe("https://lk.mini-kbp.site/?do=login");
    expect(getLkLoginUrl()).toBe("https://lk.mini-kbp.site/");
    expect(getLkLoginUrl("?do=register")).toBe("https://lk.mini-kbp.site/?do=register");
    expect(getPanelAppUrl("/staff/groups")).toBe("https://panel.mini-kbp.site/groups");
    expect(getPanelAppUrl("/staff/dashboard")).toBe("https://panel.mini-kbp.site/dashboard");
  });
});
