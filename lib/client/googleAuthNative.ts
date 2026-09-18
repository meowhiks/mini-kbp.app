import { getPublicLkOrigin } from "@/lib/client/lkAppUrl";
import { isNativeApp } from "@/lib/client/platform";
import {
  signInWithGoogleNative,
  signInWithTelegramNative,
} from "@/lib/client/nativeSocialLogin";

export function googleBridgeUrl(): string {
  return `${getPublicLkOrigin()}/auth/cb`;
}

export function isGoogleNativeSignInRequired(): boolean {
  return isNativeApp();
}

/** @deprecated Нативный вход — signInWithGoogleNative() */
export async function openGoogleSignInInSystemBrowser(): Promise<void> {
  await signInWithGoogleNative();
}

export { signInWithGoogleNative, signInWithTelegramNative };
