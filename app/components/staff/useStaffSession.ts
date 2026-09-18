"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { restoreStaffSessionFromCookie } from "@/lib/client/appAuth";
import { isPanelHost, unauthenticatedStaffLocation } from "@/lib/client/lkAppUrl";
import { loadStaffSession, type StaffSession } from "@/lib/client/miniKbpServer";

export function useStaffSession(requireAuth = true, adminOnly = false) {
  const router = useRouter();
  const [session, setSession] = useState<StaffSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      let s = await loadStaffSession();
      if (!s) {
        const restored = await restoreStaffSessionFromCookie();
        if (restored) s = await loadStaffSession();
      }
      if (cancelled) return;

      if (!s && requireAuth) {
        const host = typeof window !== "undefined" ? window.location.hostname : "";
        const dest = unauthenticatedStaffLocation(host);
        if (dest.startsWith("http")) {
          window.location.replace(dest);
          return;
        }
        router.replace(dest);
        return;
      }
      if (s && adminOnly && s.role !== "admin") {
        const home = isPanelHost(typeof window !== "undefined" ? window.location.hostname : "")
          ? "/settings"
          : "/staff/settings";
        router.replace(home);
        return;
      }
      setSession(s);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [router, requireAuth, adminOnly]);

  return { session, loading, setSession };
}
