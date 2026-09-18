"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { pickTelegramAuthPayload } from "@/lib/client/telegramAuthPayload";
import {
  finishTelegramMobileBridge,
  finishTelegramMobileOidcBridge,
  type MobileBridgeResult,
} from "@/lib/client/mobileAuthBridge";
import { decodeTelegramOidcState } from "@/lib/client/telegramOidcRedirect";
import { PRODUCTION_LK_ORIGIN } from "@/lib/client/lkAppUrl";
import { rememberOAuthCallbackBridge, resolveOAuthCallbackBridge } from "@/lib/client/oauthBridge";
import AuthIsland from "../AuthIsland";
import AuthRedirectSpinner from "@/app/components/app/AuthRedirectSpinner";
import MobileAuthReturn from "../MobileAuthReturn";
import MobileAuthReturnPolling from "../MobileAuthReturnPolling";

/** Legacy OIDC redirect_uri — новые потоки идут на /auth/cb */
const LEGACY_REDIRECT_URI = `${PRODUCTION_LK_ORIGIN}/auth/cb/telegram`;

function TelegramCbInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [returnCode, setReturnCode] = useState<string | null>(null);
  const [linkComplete, setLinkComplete] = useState(false);
  const linkToken = searchParams.get("link_token") || "";

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");
  const legacy = pickTelegramAuthPayload(
    Object.fromEntries(searchParams.entries()) as Record<string, string>
  );
  const hasCallback = Boolean((code && state) || (legacy.id && legacy.hash) || oauthError);

  useEffect(() => {
    rememberOAuthCallbackBridge(searchParams.get("bridge"));
  }, [searchParams]);

  useEffect(() => {
    if (hasCallback) return;
    const q = searchParams.toString();
    router.replace(q ? `/auth/cb?${q}` : "/auth/cb");
  }, [hasCallback, router, searchParams]);

  const finishBridgeResult = useCallback((result: MobileBridgeResult) => {
    if (!result) {
      setError("Не удалось завершить вход");
      setBusy(false);
      return;
    }
    if (result.status === "error") {
      setError(result.error || "Не удалось завершить вход");
      setBusy(false);
      return;
    }
    if (result.status === "link_complete") {
      const bridge = resolveOAuthCallbackBridge(
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("bridge")
          : null
      );
      if (bridge === "desktop" || !result.mobileCode) {
        setLinkComplete(true);
      } else {
        setReturnCode(result.mobileCode);
      }
      setBusy(false);
      return;
    }
    setReturnCode(result.mobileCode);
    setBusy(false);
  }, []);

  useEffect(() => {
    if (!hasCallback || busy || linkComplete || returnCode) return;

    if (oauthError) {
      setError(oauthError === "access_denied" ? "Вход через Telegram отменён" : oauthError);
      return;
    }

    void (async () => {
      setBusy(true);
      if (code && state) {
        const session = decodeTelegramOidcState(state);
        if (!session) {
          setError("Неверный state. Закройте вкладку и войдите снова из приложения.");
          setBusy(false);
          return;
        }
        const resolvedLinkToken = linkToken || session.linkToken || "";
        const result = await finishTelegramMobileOidcBridge({
          code,
          state,
          verifier: session.verifier,
          redirectUri: LEGACY_REDIRECT_URI,
          linkToken: resolvedLinkToken || undefined,
        });
        finishBridgeResult(result);
        return;
      }
      if (legacy.id && legacy.hash) {
        const result = await finishTelegramMobileBridge(legacy, linkToken || undefined);
        finishBridgeResult(result);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCallback]);

  if (!hasCallback) {
    return <AuthRedirectSpinner />;
  }

  if (returnCode) {
    return <MobileAuthReturn kind="telegram" mobileCode={returnCode} />;
  }

  if (linkComplete) {
    return <MobileAuthReturnPolling kind="telegram" />;
  }

  return (
    <AuthIsland title="Вход через Telegram">
      <div className="mx-auto mb-2 h-10 w-10 animate-spin rounded-full border-[3px] border-gray-200" style={{ borderTopColor: "#3390ec" }} aria-hidden />
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
    </AuthIsland>
  );
}

/** @deprecated OIDC callback legacy; UI → /auth/cb */
export default function TelegramCbPage() {
  return (
    <Suspense fallback={<AuthRedirectSpinner />}>
      <TelegramCbInner />
    </Suspense>
  );
}
