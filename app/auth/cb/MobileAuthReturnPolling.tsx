"use client";

import { oauthCallbackReturnCopy, resolveOAuthCallbackBridge } from "@/lib/client/oauthBridge";
import { MOBILE_DEEP_LINK_SCHEME, navigateToAppDeepLink } from "@/lib/client/mobileDeepLink";
import { useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import AuthSceneBackdrop from "./AuthSceneBackdrop";

type Props = {
  kind: "telegram" | "google" | "site";
};

/** Страница после успешного входа на сайте: приложение узнает об этом через polling. */
export default function MobileAuthReturnPolling({ kind }: Props) {
  const searchParams = useSearchParams();
  const copy = oauthCallbackReturnCopy(resolveOAuthCallbackBridge(searchParams.get("bridge")));
  const tryOpenApp = useCallback(() => {
    navigateToAppDeepLink(`auth/${kind}?done=1`);
  }, [kind]);

  useEffect(() => {
    if (!copy.showDeepLink) return;
    tryOpenApp();
    const timer = window.setInterval(tryOpenApp, 1500);
    const stop = window.setTimeout(() => window.clearInterval(timer), 8000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, [copy.showDeepLink, tryOpenApp]);

  return (
    <div className="safe-top relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[#f0f4fa] px-6 text-center">
      <AuthSceneBackdrop />
      <div className="relative z-10 mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
        <svg className="h-8 w-8 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h1 className="relative z-10 mb-2 text-xl font-semibold text-gray-900">{copy.title}</h1>
      <p className="relative z-10 mb-8 max-w-sm text-sm leading-relaxed text-gray-600">{copy.body}</p>
      {copy.showDeepLink ? (
        <>
          <button
            type="button"
            onClick={tryOpenApp}
            className="relative z-10 rounded-full bg-[#3390ec] px-8 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#2d7fd6]"
          >
            Вернуться в приложение
          </button>
          <p className="relative z-10 mt-6 text-xs text-gray-400">Схема: {MOBILE_DEEP_LINK_SCHEME}://</p>
        </>
      ) : null}
    </div>
  );
}
