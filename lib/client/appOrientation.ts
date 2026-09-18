/** Native Android portrait lock / unlock. */

import { Capacitor, registerPlugin } from "@capacitor/core";

type AppOrientationPlugin = {
  setAllowRotation(options: { allow: boolean }): Promise<void>;
};

const AppOrientation = registerPlugin<AppOrientationPlugin>("AppOrientation");

export async function setNativeAllowRotation(allow: boolean): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return;
  try {
    await AppOrientation.setAllowRotation({ allow });
  } catch {
    // Plugin may be missing on web/old builds — ignore.
  }
}
