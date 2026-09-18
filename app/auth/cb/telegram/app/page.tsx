"use client";

import { Suspense, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { navigateToAppDeepLink } from "@/lib/client/mobileDeepLink";

/** Custom Tab → deep link: передаёт code/state в приложение (MIUI: anchor + intent fallback). */
function TelegramAppBridgeInner() {
  const searchParams = useSearchParams();
  const sentRef = useRef(false);

  useEffect(() => {
    if (sentRef.current) return;
    sentRef.current = true;

    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      const q = new URLSearchParams({ error });
      navigateToAppDeepLink(`auth/telegram/oidc?${q.toString()}`);
      return;
    }

    if (!code || !state) {
      navigateToAppDeepLink("auth/telegram/oidc?error=missing_code");
      return;
    }

    const q = new URLSearchParams({ code, state });
    navigateToAppDeepLink(`auth/telegram/oidc?${q.toString()}`);
  }, [searchParams]);

  return (
    <div className="safe-top flex min-h-dvh items-center justify-center px-6 text-center text-sm text-gray-500">
      Возврат в приложение…
    </div>
  );
}

export default function TelegramAppBridgePage() {
  return (
    <Suspense
      fallback={
        <div className="safe-top flex min-h-dvh items-center justify-center text-sm text-gray-500">
          Загрузка…
        </div>
      }
    >
      <TelegramAppBridgeInner />
    </Suspense>
  );
}
