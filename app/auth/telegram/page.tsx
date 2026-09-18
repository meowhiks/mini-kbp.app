"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loginWithTelegram, loginWithTelegramOidcCode } from "@/lib/client/appAuth";
import { consumeRedirectQ, resolvePostAuthPath } from "@/lib/client/appQuery";
import { navigatePostAuth } from "@/lib/client/navigatePostAuth";
import { pickTelegramAuthPayload } from "@/lib/client/telegramAuthPayload";
import {
  consumeTelegramAuthHash,
} from "@/lib/client/telegramAuthHash";
import { resolveTelegramOidcLogin } from "@/lib/client/telegramOidcRedirect";

function TelegramAuthCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");

  const finishLegacy = useCallback(
    async (payload: Record<string, string | number>) => {
      const r = await loginWithTelegram(payload);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if ("role" in r) {
        navigatePostAuth(router, resolvePostAuthPath(r.role, consumeRedirectQ()));
        return;
      }
      router.replace("/app?do=verify");
    },
    [router]
  );

  const finishOidc = useCallback(
    async (code: string, state: string) => {
      const session = resolveTelegramOidcLogin(state);
      if (!session) {
        setError("Сессия Telegram истекла. Попробуйте войти снова.");
        return;
      }
      const r = await loginWithTelegramOidcCode({
        code,
        codeVerifier: session.verifier,
        redirectUri: session.redirectUri,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if ("role" in r) {
        navigatePostAuth(router, resolvePostAuthPath(r.role, consumeRedirectQ()));
        return;
      }
      router.replace("/app?do=verify");
    },
    [router]
  );

  useEffect(() => {
    const oauthError = searchParams.get("error");
    if (oauthError) {
      setError(oauthError === "access_denied" ? "Вход через Telegram отменён" : oauthError);
      return;
    }

    const code = searchParams.get("code");
    const state = searchParams.get("state");
    if (code && state) {
      void finishOidc(code, state);
      return;
    }

    const hashPayload = consumeTelegramAuthHash();
    if (hashPayload) {
      void finishLegacy(hashPayload);
      return;
    }

    const payload = pickTelegramAuthPayload(
      Object.fromEntries(searchParams.entries()) as Record<string, string>
    );
    if (!payload.id || !payload.hash) {
      setError("Нет данных от Telegram. Попробуйте войти снова.");
      return;
    }
    void finishLegacy(payload);
  }, [finishLegacy, finishOidc, searchParams]);

  return (
    <div className="safe-top flex min-h-dvh flex-col items-center justify-center bg-[#f4f5f7] px-6 text-center">
      {error ? (
        <>
          <p className="mb-4 text-sm text-red-600">{error}</p>
          <a href="/app" className="text-sm font-medium text-[#3390ec] hover:underline">
            Вернуться ко входу
          </a>
        </>
      ) : (
        <p className="text-sm text-gray-500">Вход через Telegram…</p>
      )}
    </div>
  );
}

export default function TelegramAuthPage() {
  return (
    <Suspense
      fallback={
        <div className="safe-top flex min-h-dvh items-center justify-center text-sm text-gray-500">
          Загрузка…
        </div>
      }
    >
      <TelegramAuthCallback />
    </Suspense>
  );
}
