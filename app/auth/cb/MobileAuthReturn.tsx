"use client";

import { useCallback, useEffect } from "react";
import { openMobileAuthReturn } from "@/lib/client/mobileAuthBridge";
import AuthSceneBackdrop from "./AuthSceneBackdrop";

type Props = {
  kind: "telegram" | "google";
  mobileCode: string;
};

export default function MobileAuthReturn({ kind, mobileCode }: Props) {
  const retryReturn = useCallback(() => {
    openMobileAuthReturn(kind, mobileCode);
  }, [kind, mobileCode]);

  useEffect(() => {
    retryReturn();
    const timer = window.setInterval(retryReturn, 1200);
    const stop = window.setTimeout(() => window.clearInterval(timer), 6000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, [retryReturn]);

  return (
    <div className="safe-top relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[#f0f4fa] px-6 text-center">
      <AuthSceneBackdrop />
      <div className="relative z-10">
        <h1 className="mb-2 text-lg font-semibold text-gray-900">Готово</h1>
        <p className="mb-6 max-w-sm text-sm text-gray-500">
          Вход подтверждён. Можете вернуться в приложение — код или двухфакторную аутентификацию вводите там.
        </p>
        <button
          type="button"
          onClick={retryReturn}
          className="rounded-full bg-[#3390ec] px-6 py-3 text-sm font-semibold text-white"
        >
          Вернуться в приложение
        </button>
        <p className="mt-4 text-xs text-gray-400">
          Если переход не произошёл автоматически — нажмите кнопку выше
        </p>
      </div>
    </div>
  );
}
