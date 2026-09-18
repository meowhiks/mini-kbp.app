/** Возврат из Custom Tab в нативное приложение. */

export const MOBILE_DEEP_LINK_SCHEME = "com.kbp.journal";
const ANDROID_PACKAGE = "com.kbp.journal";

export function buildAppDeepLink(path: string): string {
  const normalized = path.replace(/^\/+/, "");
  return `${MOBILE_DEEP_LINK_SCHEME}://${normalized}`;
}

/**
 * Открывает приложение из Chrome Custom Tab.
 * anchor click + custom scheme — надёжнее intent:// на MIUI.
 */
export function navigateToAppDeepLink(path: string): void {
  if (typeof window === "undefined") return;

  const normalized = path.replace(/^\/+/, "");
  const customUrl = buildAppDeepLink(normalized);

  try {
    const anchor = document.createElement("a");
    anchor.href = customUrl;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } catch {
    // ignore
  }

  window.setTimeout(() => {
    try {
      window.location.href = customUrl;
    } catch {
      // ignore
    }
  }, 50);

  if (/Android/i.test(navigator.userAgent)) {
    window.setTimeout(() => {
      try {
        const intent = `intent://${normalized}#Intent;scheme=${MOBILE_DEEP_LINK_SCHEME};package=${ANDROID_PACKAGE};end`;
        window.location.href = intent;
      } catch {
        // ignore
      }
    }, 200);
  }
}
