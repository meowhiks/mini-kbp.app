import { describe, expect, it } from "vitest";
import {
  classifyDesktopNavigation,
  rewriteApexToLkUrl,
  rewriteApexToLocalBundle,
} from "../../../desktop/navigationPolicy.js";

describe("classifyDesktopNavigation", () => {
  it("opens Telegram desktop via custom protocol instead of navigating the window", () => {
    expect(classifyDesktopNavigation("tg://resolve?domain=Bot")).toBe("protocol");
    expect(classifyDesktopNavigation("telegram://")).toBe("protocol");
  });

  it("treats oauth.telegram.org as an OAuth popup, not the main window", () => {
    expect(
      classifyDesktopNavigation("https://oauth.telegram.org/auth?client_id=1")
    ).toBe("telegram-oauth");
  });

  it("returns Mini KBP callback URLs to the main window", () => {
    expect(classifyDesktopNavigation("https://lk.mini-kbp.site/auth/telegram?code=1")).toBe("app");
    expect(classifyDesktopNavigation("https://panel.mini-kbp.site/")).toBe("app");
    expect(classifyDesktopNavigation("http://localhost:3000/auth/telegram")).toBe("app");
  });

  it("treats local minikbp:// bundle as app", () => {
    expect(classifyDesktopNavigation("minikbp://bundle/app")).toBe("app");
    expect(classifyDesktopNavigation("minikbp://bundle/app/journal")).toBe("app");
  });

  it("opens unrelated sites in the system browser", () => {
    expect(classifyDesktopNavigation("https://web.telegram.org/k/")).toBe("external");
    expect(classifyDesktopNavigation("https://api.mini-kbp.site/v0/")).toBe("external");
  });

  it("rewrites apex and www onto lk instead of keeping extra hosts", () => {
    expect(classifyDesktopNavigation("https://mini-kbp.site/")).toBe("apex");
    expect(classifyDesktopNavigation("https://www.mini-kbp.site/privacy")).toBe("apex");
    expect(rewriteApexToLkUrl("https://www.mini-kbp.site/privacy")).toBe(
      "https://lk.mini-kbp.site/privacy"
    );
  });

  it("rewrites apex onto local Electron bundle", () => {
    expect(rewriteApexToLocalBundle("https://mini-kbp.site/app")).toBe("minikbp://bundle/app");
    expect(rewriteApexToLocalBundle("https://www.mini-kbp.site/privacy?x=1")).toBe(
      "minikbp://bundle/privacy?x=1"
    );
  });
});
