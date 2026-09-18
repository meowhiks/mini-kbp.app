/**
 * Native — вход через сайт в Chrome + polling на сервере.
 */

import { type AppPendingAuth, type AuthRole } from "@/lib/client/appAuth";
import { isNativeApp } from "@/lib/client/platform";
import { signInWithMobileWebLink } from "@/lib/client/mobileWebAuthLink";

export type NativeSignInResult =
  | { ok: true; role: AuthRole }
  | { ok: true; pending: AppPendingAuth }
  | { ok: false; error: string; cancelled?: boolean };

let siteLoginFlow: Promise<NativeSignInResult> | null = null;

export async function ensureNativeSocialLoginInit(): Promise<void> {
  /* no-op */
}

export async function signInWithSiteNative(signal?: AbortSignal): Promise<NativeSignInResult> {
  if (!isNativeApp()) {
    return { ok: false, error: "Доступно только в приложении" };
  }
  if (siteLoginFlow) return siteLoginFlow;
  siteLoginFlow = signInWithMobileWebLink("site", signal).finally(() => {
    siteLoginFlow = null;
  });
  return siteLoginFlow;
}

/** @deprecated используйте signInWithSiteNative */
export async function signInWithGoogleNative(): Promise<NativeSignInResult> {
  return signInWithSiteNative();
}

/** @deprecated используйте signInWithSiteNative */
export async function signInWithTelegramNative(): Promise<NativeSignInResult> {
  return signInWithSiteNative();
}
