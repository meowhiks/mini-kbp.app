import { describe, expect, it } from "vitest";
import {
  appPageFromTab,
  buildAppRouteSearchParams,
  parseAppPage,
  parseSettingsCategory,
  tabFromAppPage,
} from "@/lib/client/appRouteQuery";
import { APP_TAB_JOURNAL, APP_TAB_SETTINGS, APP_TAB_TIMETABLE } from "@/lib/client/appTabs";

describe("appRouteQuery", () => {
  it("maps tabs ↔ page slugs (no journal page)", () => {
    expect(appPageFromTab(APP_TAB_JOURNAL)).toBeNull();
    expect(tabFromAppPage("settings")).toBe(APP_TAB_SETTINGS);
    expect(appPageFromTab(APP_TAB_TIMETABLE)).toBe("timetable");
  });

  it("parses page and sc; legacy journal → timetable", () => {
    expect(parseAppPage("page=journal&tt_type=group")).toBe("timetable");
    expect(parseAppPage("page=timetable")).toBe("timetable");
    expect(parseAppPage("foo=1")).toBeNull();
    expect(parseSettingsCategory("page=settings&sc=appearance")).toBe("appearance");
    expect(parseSettingsCategory("page=settings&sc=hub")).toBeNull();
    expect(parseSettingsCategory("page=settings")).toBeNull();
  });

  it("writes page/sc and clears sc off settings", () => {
    const withSc = buildAppRouteSearchParams("tt_type=group&tt_id=9", {
      page: "settings",
      sc: "security",
    });
    expect(withSc.get("page")).toBe("settings");
    expect(withSc.get("sc")).toBe("security");
    expect(withSc.get("tt_type")).toBe("group");

    const toTimetable = buildAppRouteSearchParams(withSc, { page: "timetable" });
    expect(toTimetable.get("page")).toBe("timetable");
    expect(toTimetable.get("sc")).toBeNull();
    expect(toTimetable.get("tt_id")).toBe("9");

    const hub = buildAppRouteSearchParams("page=settings&sc=profile", { page: "settings", sc: null });
    expect(hub.get("sc")).toBeNull();
  });
});
