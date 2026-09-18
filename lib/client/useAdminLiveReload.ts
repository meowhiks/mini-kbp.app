import { useEffect } from "react";
import { ADMIN_LIVE_RELOAD_MS } from "@/lib/client/adminAutosave";

/** Тихое Ajax-обновление списка в админке, без спиннера. */
export function useAdminLiveReload(enabled: boolean, reloadSilent: () => void | Promise<void>) {
  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      void reloadSilent();
    };
    const timer = window.setInterval(tick, ADMIN_LIVE_RELOAD_MS);
    return () => window.clearInterval(timer);
  }, [enabled, reloadSilent]);
}
