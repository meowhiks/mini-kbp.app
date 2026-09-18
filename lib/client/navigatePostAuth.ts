import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { getLkAppUrl, getPanelAppUrl, isPanelHost } from "@/lib/client/lkAppUrl";

/** Полная навигация после входа (учитывает lk ↔ panel). */
export function navigatePostAuth(router: AppRouterInstance, path: string): void {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    window.location.replace(path);
    return;
  }

  if (typeof window !== "undefined") {
    const host = window.location.hostname;

    if (path.startsWith("/staff")) {
      const panelPath = getPanelAppUrl(path);
      if (panelPath.startsWith("http")) {
        window.location.replace(panelPath);
        return;
      }
    }

    if (path.startsWith("/app") && isPanelHost(host)) {
      window.location.replace(getLkAppUrl(path));
      return;
    }
  }

  router.replace(path);
}
