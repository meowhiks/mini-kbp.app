import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  APP_TAB_JOURNAL,
  APP_TAB_PROFILE,
  APP_TAB_SETTINGS,
  APP_TAB_TIMETABLE,
  consumeAppSettingsScreen,
  isAppSettingsScreen,
  isAppTabId,
  storeAppSettingsScreen,
  storeAppTab,
} from "@/lib/client/appTabs";

describe("appTabs settings hub", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("treats only two main tabs as valid", () => {
    expect(isAppTabId(0)).toBe(true);
    expect(isAppTabId(1)).toBe(true);
    expect(isAppTabId(2)).toBe(false);
    expect(isAppTabId(3)).toBe(false);
  });

  it("maps legacy profile tab deep link to settings", () => {
    storeAppTab(APP_TAB_PROFILE);
    expect(store.get("app_journal_tab")).toBe(String(APP_TAB_SETTINGS));
  });

  it("maps legacy journal tab deep link to timetable", () => {
    storeAppTab(APP_TAB_JOURNAL);
    expect(store.get("app_journal_tab")).toBe(String(APP_TAB_TIMETABLE));
  });

  it("stores and consumes settings sub-screen once", () => {
    expect(isAppSettingsScreen("profile")).toBe(true);
    expect(isAppSettingsScreen("archive")).toBe(true);
    expect(isAppSettingsScreen("nope")).toBe(false);
    storeAppSettingsScreen("security");
    expect(consumeAppSettingsScreen()).toBe("security");
    expect(consumeAppSettingsScreen()).toBe(null);
  });
});
