/** Гостевой режим Capacitor/Electron: только расписание и настройки без входа. */

import { storageGet, storageRemove, storageSet } from "@/lib/client/storage";
import { isBundledAppShell } from "@/lib/client/platform";

const GUEST_MODE_KEY = "app_guest_mode_v1";

export async function isGuestModeActive(): Promise<boolean> {
  if (!isBundledAppShell()) return false;
  try {
    return (await storageGet(GUEST_MODE_KEY)) === "1";
  } catch {
    return false;
  }
}

export async function enableGuestMode(): Promise<void> {
  if (!isBundledAppShell()) return;
  await storageSet(GUEST_MODE_KEY, "1");
}

export async function clearGuestMode(): Promise<void> {
  try {
    await storageRemove(GUEST_MODE_KEY);
  } catch {
    // ignore
  }
}
