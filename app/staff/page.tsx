"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { authRedirectPath, restoreStaffSessionFromCookie } from "@/lib/client/appAuth";
import {
  PRODUCTION_PANEL_ORIGIN,
  staffPathShouldGoToPanel,
  unauthenticatedStaffLocation,
} from "@/lib/client/lkAppUrl";
import { toPublicStaffPath } from "@/lib/client/hostRouting";
import { NATIVE_APP_HOME } from "@/lib/client/appQuery";
import { loadStaffSession } from "@/lib/client/miniKbpServer";
import { isNativeApp } from "@/lib/client/platform";

/** /staff на панели — staff UI. На lk — редирект на panel. Без сессии — вход в ЛК. */
export default function StaffRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const host = window.location.hostname;
      if (staffPathShouldGoToPanel(host)) {
        window.location.replace(
          `${PRODUCTION_PANEL_ORIGIN.replace(/\/+$/, "")}${toPublicStaffPath(window.location.pathname)}${window.location.search}`
        );
        return;
      }
    }

    (async () => {
      let s = await loadStaffSession();
      if (!s) {
        const restored = await restoreStaffSessionFromCookie();
        if (restored) s = await loadStaffSession();
      }
      if (s) {
        const target = isNativeApp() ? NATIVE_APP_HOME : authRedirectPath(s.role);
        if (target.startsWith("http")) {
          window.location.replace(target);
          return;
        }
        router.replace(target);
        return;
      }
      window.location.replace(
        unauthenticatedStaffLocation(typeof window !== "undefined" ? window.location.hostname : "")
      );
    })();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-white text-sm text-gray-500">
      Перенаправление…
    </div>
  );
}
