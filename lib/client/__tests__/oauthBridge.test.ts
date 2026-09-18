import { describe, expect, it } from "vitest";
import {
  appendExternalOAuthBridgeParams,
  oauthCallbackReturnCopy,
  resolveOAuthCallbackBridge,
  shouldUseExternalOAuthBridge,
} from "@/lib/client/oauthBridge";

describe("shouldUseExternalOAuthBridge", () => {
  it("uses system browser for native app and Electron", () => {
    expect(shouldUseExternalOAuthBridge({ native: true, electron: false })).toBe(true);
    expect(shouldUseExternalOAuthBridge({ native: false, electron: true })).toBe(true);
    expect(shouldUseExternalOAuthBridge({ native: false, electron: false })).toBe(false);
  });
});

describe("appendExternalOAuthBridgeParams", () => {
  const authUrl = "https://lk.mini-kbp.site/auth/cb?from=app&link_token=abc";

  it("marks Electron callbacks so the browser page tells the user to close the tab", () => {
    const url = appendExternalOAuthBridgeParams(authUrl, { electron: true });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("bridge")).toBe("desktop");
    expect(parsed.searchParams.get("link_token")).toBe("abc");
    expect(parsed.searchParams.get("from")).toBe("app");
  });

  it("does not add desktop bridge for phone Custom Tabs", () => {
    expect(appendExternalOAuthBridgeParams(authUrl, { electron: false })).toBe(authUrl);
  });
});

describe("oauthCallbackReturnCopy", () => {
  it("asks desktop users to close the browser", () => {
    const copy = oauthCallbackReturnCopy("desktop");
    expect(copy.showDeepLink).toBe(false);
    expect(copy.body).toMatch(/Мини КБиП|вернуться/i);
  });

  it("asks phone users to return to the app without a done=1 deep link", () => {
    const copy = oauthCallbackReturnCopy(null);
    expect(copy.showDeepLink).toBe(false);
    expect(copy.body).toMatch(/приложен/i);
  });
});

describe("resolveOAuthCallbackBridge", () => {
  it("prefers the query param over an empty search", () => {
    expect(resolveOAuthCallbackBridge("desktop")).toBe("desktop");
    expect(resolveOAuthCallbackBridge("")).toBe(null);
  });
});
