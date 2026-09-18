/**
 * Persist mobile web-link poll token so remount / deep-link return can resume JWT poll.
 */

import { storageGetObject, storageRemove, storageSetObject } from "@/lib/client/storage";
import type { MobileWebLinkKind } from "@/lib/client/mobileWebAuthLink";

const KEY = "mobile_web_link_session_v1";
const MAX_AGE_MS = 300_000;

export type MobileWebLinkSession = {
  token: string;
  kind: MobileWebLinkKind;
  startedAt: number;
};

export async function saveMobileWebLinkSession(session: MobileWebLinkSession): Promise<void> {
  await storageSetObject(KEY, session);
}

export async function clearMobileWebLinkSession(): Promise<void> {
  await storageRemove(KEY);
}

export async function loadMobileWebLinkSession(): Promise<MobileWebLinkSession | null> {
  const raw = await storageGetObject<MobileWebLinkSession>(KEY);
  if (!raw?.token || !raw.kind || !raw.startedAt) return null;
  if (Date.now() - raw.startedAt > MAX_AGE_MS) {
    await clearMobileWebLinkSession();
    return null;
  }
  return raw;
}
