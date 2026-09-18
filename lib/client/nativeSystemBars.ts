/** Sync Android system status/navigation bar icon contrast with app theme. */

import { Capacitor, registerPlugin } from "@capacitor/core";
import type { AppTheme } from "@/lib/client/appTheme";

type ThemeSystemBarsPlugin = {
  setTheme(options: { theme: AppTheme }): Promise<void>;
};

const ThemeSystemBars = registerPlugin<ThemeSystemBarsPlugin>("ThemeSystemBars");

export async function syncNativeSystemBars(theme: AppTheme): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return;
  try {
    await ThemeSystemBars.setTheme({ theme });
  } catch {
    // Plugin may be missing on web/old builds — ignore.
  }
}
