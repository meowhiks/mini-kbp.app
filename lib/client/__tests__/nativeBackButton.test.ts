import { describe, expect, it, vi } from "vitest";
import { handleNativeAppBackButton } from "@/lib/client/nativeBackButton";

describe("handleNativeAppBackButton", () => {
  it("ignores non-native shells", () => {
    const historyBack = vi.fn();
    const minimizeApp = vi.fn();
    expect(
      handleNativeAppBackButton({ canGoBack: true }, { isNative: false, historyBack, minimizeApp })
    ).toBe(false);
    expect(historyBack).not.toHaveBeenCalled();
  });

  it("goes history.back when WebView can go back", () => {
    const historyBack = vi.fn();
    const minimizeApp = vi.fn();
    expect(
      handleNativeAppBackButton({ canGoBack: true }, { isNative: true, historyBack, minimizeApp })
    ).toBe(true);
    expect(historyBack).toHaveBeenCalledOnce();
    expect(minimizeApp).not.toHaveBeenCalled();
  });

  it("uses in-app back before history", () => {
    const historyBack = vi.fn();
    const minimizeApp = vi.fn();
    const tryInAppBack = vi.fn(() => true);
    expect(
      handleNativeAppBackButton(
        { canGoBack: true },
        { isNative: true, historyBack, minimizeApp, tryInAppBack }
      )
    ).toBe(true);
    expect(tryInAppBack).toHaveBeenCalledOnce();
    expect(historyBack).not.toHaveBeenCalled();
  });

  it("walks history when SPA depth says so even if canGoBack is false", () => {
    const historyBack = vi.fn();
    const minimizeApp = vi.fn();
    expect(
      handleNativeAppBackButton(
        { canGoBack: false },
        { isNative: true, historyBack, minimizeApp, hasSpaHistory: () => true }
      )
    ).toBe(true);
    expect(historyBack).toHaveBeenCalledOnce();
    expect(minimizeApp).not.toHaveBeenCalled();
  });

  it("minimizes when at root of history", () => {
    const historyBack = vi.fn();
    const minimizeApp = vi.fn();
    expect(
      handleNativeAppBackButton({ canGoBack: false }, { isNative: true, historyBack, minimizeApp })
    ).toBe(true);
    expect(historyBack).not.toHaveBeenCalled();
    expect(minimizeApp).toHaveBeenCalledOnce();
  });
});
