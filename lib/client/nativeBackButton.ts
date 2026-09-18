export type NativeBackPayload = { canGoBack: boolean };

/**
 * System Back: prefer in-app dismiss (settings sub-screen), then history,
 * then minimize. Capacitor `canGoBack` is unreliable with Next soft navigations.
 */
export function handleNativeAppBackButton(
  payload: NativeBackPayload,
  deps: {
    isNative: boolean;
    historyBack: () => void;
    minimizeApp: () => void | Promise<void>;
    /** Close overlays / settings category; return true if handled. */
    tryInAppBack?: () => boolean;
    /** True when our SPA pushed routes that WebView may not report. */
    hasSpaHistory?: () => boolean;
  }
): boolean {
  if (!deps.isNative) return false;
  if (deps.tryInAppBack?.()) return true;
  if (payload.canGoBack || deps.hasSpaHistory?.()) {
    deps.historyBack();
    return true;
  }
  void deps.minimizeApp();
  return true;
}
