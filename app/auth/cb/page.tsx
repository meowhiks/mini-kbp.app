"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  getGoogleClientId,
  mountGoogleSignInVisible,
  resolveGoogleClientId,
  type GoogleCredentialResponse,
} from "@/lib/client/googleAuth";
import {
  finishGoogleMobileBridge,
  finishTelegramMobileBridge,
  finishTelegramMobileOidcBridge,
  type MobileBridgeResult,
} from "@/lib/client/mobileAuthBridge";
import { pickTelegramAuthPayload } from "@/lib/client/telegramAuthPayload";
import {
  decodeTelegramOidcState,
  startTelegramMobileOidcRedirectStateless,
} from "@/lib/client/telegramOidcRedirect";
import { PRODUCTION_LK_ORIGIN } from "@/lib/client/lkAppUrl";
import { rememberOAuthCallbackBridge, resolveOAuthCallbackBridge } from "@/lib/client/oauthBridge";
import { TelegramIcon } from "@/lib/client/oauthIcons";
import AuthRedirectSpinner from "@/app/components/app/AuthRedirectSpinner";
import AuthIsland from "./AuthIsland";
import MobileAuthReturn from "./MobileAuthReturn";
import MobileAuthReturnPolling from "./MobileAuthReturnPolling";

/** Единый redirect для OAuth → /auth/cb */
export const AUTH_CB_PATH = "/auth/cb";
const REDIRECT_URI = `${PRODUCTION_LK_ORIGIN}${AUTH_CB_PATH}`;
const DEFAULT_TG_CLIENT_ID =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_TELEGRAM_BOT_CLIENT_ID?.trim()) ||
  "8343745062";

type ReturnKind = "telegram" | "google";

function AuthCbInner() {
  const searchParams = useSearchParams();
  const hostRef = useRef<HTMLDivElement>(null);
  const googleMountedRef = useRef(false);
  const googleCbRef = useRef<(r: GoogleCredentialResponse) => void>(() => {});
  const oauthReturnHandled = useRef(false);
  const [error, setError] = useState("");
  const [clientId, setClientId] = useState<string | null>(() => getGoogleClientId());
  const [busy, setBusy] = useState(false);
  const [returnCode, setReturnCode] = useState<string | null>(null);
  const [returnKind, setReturnKind] = useState<ReturnKind>("google");
  const [linkComplete, setLinkComplete] = useState(false);
  const [linkKind, setLinkKind] = useState<ReturnKind>("google");
  const [tgStarted, setTgStarted] = useState(false);
  const linkToken = searchParams.get("link_token") || "";

  useEffect(() => {
    rememberOAuthCallbackBridge(searchParams.get("bridge"));
  }, [searchParams]);

  useEffect(() => {
    if (clientId) return;
    void resolveGoogleClientId().then((id) => {
      if (id) setClientId(id);
    });
  }, [clientId]);

  const finishBridgeResult = useCallback((kind: ReturnKind, result: MobileBridgeResult) => {
    if (!result) {
      setError("Не удалось завершить вход");
      setBusy(false);
      setTgStarted(false);
      return;
    }
    if (result.status === "error") {
      setError(result.error || "Не удалось завершить вход");
      setBusy(false);
      setTgStarted(false);
      return;
    }
    if (result.status === "link_complete") {
      setLinkKind(kind);
      const bridge = resolveOAuthCallbackBridge(
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("bridge")
          : null
      );
      if (bridge === "desktop" || !result.mobileCode) {
        setLinkComplete(true);
      } else {
        setReturnKind(kind);
        setReturnCode(result.mobileCode);
      }
      setBusy(false);
      return;
    }
    setReturnKind(kind);
    setReturnCode(result.mobileCode);
    setBusy(false);
  }, []);

  const finishGoogle = useCallback(
    async (credential: string) => {
      setBusy(true);
      setError("");
      const result = await finishGoogleMobileBridge(credential, linkToken || undefined);
      finishBridgeResult("google", result);
    },
    [finishBridgeResult, linkToken]
  );

  googleCbRef.current = (response: GoogleCredentialResponse) => {
    if (!response.credential) {
      setError("Google не вернул credential");
      return;
    }
    void finishGoogle(response.credential);
  };

  // Монтируем Google один раз — иначе remount → лаг входа
  useEffect(() => {
    if (!clientId || !hostRef.current || linkComplete || returnCode || googleMountedRef.current) return;
    googleMountedRef.current = true;
    let cancelled = false;
    void mountGoogleSignInVisible(hostRef.current, clientId, (response) => {
      if (!cancelled) googleCbRef.current(response);
    }).catch(() => {
      if (!cancelled) {
        googleMountedRef.current = false;
        setError("Не удалось загрузить Google");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [clientId, linkComplete, returnCode]);

  const finishOidcCallback = useCallback(
    async (code: string, state: string) => {
      setBusy(true);
      setError("");
      const session = decodeTelegramOidcState(state);
      if (!session) {
        setError("Неверный state. Закройте вкладку и войдите снова из приложения.");
        setBusy(false);
        setTgStarted(false);
        return;
      }
      const resolvedLinkToken = linkToken || session.linkToken || "";
      const result = await finishTelegramMobileOidcBridge({
        code,
        state,
        verifier: session.verifier,
        redirectUri: REDIRECT_URI,
        linkToken: resolvedLinkToken || undefined,
      });
      finishBridgeResult("telegram", result);
    },
    [finishBridgeResult, linkToken]
  );

  const handleTelegramStart = useCallback(async () => {
    if (busy || tgStarted) return;
    setTgStarted(true);
    setBusy(true);
    setError("");

    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("error");
    if (oauthError) {
      setError(oauthError === "access_denied" ? "Вход через Telegram отменён" : oauthError);
      setBusy(false);
      setTgStarted(false);
      return;
    }

    const code = params.get("code");
    const state = params.get("state");
    if (code && state) {
      await finishOidcCallback(code, state);
      return;
    }

    const legacy = pickTelegramAuthPayload(Object.fromEntries(params.entries()) as Record<string, string>);
    if (legacy.id && legacy.hash) {
      const result = await finishTelegramMobileBridge(legacy, linkToken || undefined);
      finishBridgeResult("telegram", result);
      return;
    }

    try {
      await startTelegramMobileOidcRedirectStateless(DEFAULT_TG_CLIENT_ID, AUTH_CB_PATH, linkToken);
    } catch {
      setError("Не удалось открыть Telegram");
      setBusy(false);
      setTgStarted(false);
    }
  }, [busy, finishBridgeResult, finishOidcCallback, linkToken, tgStarted]);

  // Только возврат OAuth (code/state или legacy) — без автостарта по provider
  useEffect(() => {
    if (oauthReturnHandled.current) return;
    const params = new URLSearchParams(window.location.search);
    const hasOidc = Boolean(params.get("code") && params.get("state"));
    const legacy = pickTelegramAuthPayload(Object.fromEntries(params.entries()) as Record<string, string>);
    const hasLegacy = Boolean(legacy.id && legacy.hash);
    const oauthError = params.get("error");
    if (!(hasOidc || hasLegacy || oauthError)) return;
    oauthReturnHandled.current = true;
    void handleTelegramStart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (returnCode) {
    return <MobileAuthReturn kind={returnKind} mobileCode={returnCode} />;
  }

  if (linkComplete) {
    return <MobileAuthReturnPolling kind={linkKind} />;
  }

  return (
    <AuthIsland title="Вход">
      <p className="mb-6 text-sm text-gray-500">Выберите способ входа</p>

      <div className="flex w-full flex-col gap-3">
        {clientId ? (
          <div className="google-auth-mobile-wrap w-full">
            <div ref={hostRef} className="flex w-full justify-center" />
          </div>
        ) : (
          <div
            className="mx-auto h-10 w-10 animate-spin rounded-full border-[3px] border-gray-200"
            style={{ borderTopColor: "#3390ec" }}
            aria-hidden
          />
        )}

        <button
          type="button"
          onClick={() => void handleTelegramStart()}
          disabled={busy && tgStarted}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#3390ec] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#2d7fd6] disabled:opacity-60"
        >
          <TelegramIcon className="h-5 w-5 shrink-0 brightness-0 invert" />
          Продолжить с Telegram
        </button>
      </div>

      {busy || tgStarted ? (
        <div
          className="mx-auto mt-6 h-10 w-10 animate-spin rounded-full border-[3px] border-gray-200"
          style={{ borderTopColor: "#3390ec" }}
          aria-hidden
        />
      ) : null}
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
    </AuthIsland>
  );
}

export default function AuthCbPage() {
  return (
    <Suspense fallback={<AuthRedirectSpinner />}>
      <AuthCbInner />
    </Suspense>
  );
}
