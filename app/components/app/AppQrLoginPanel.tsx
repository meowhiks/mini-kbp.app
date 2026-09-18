"use client";

import { useEffect, useRef, useState } from "react";
import ProfileQrCode from "@/app/components/app/ProfileQrCode";
import { startQrLogin, waitForQrLogin, type QrLoginResult } from "@/lib/client/qrLogin";
import type { AppPendingAuth, AuthRole } from "@/lib/client/appAuth";

type AppQrLoginPanelProps = {
  isDark: boolean;
  onBack: () => void;
  onSuccess: (r: { role: AuthRole } | { pending: AppPendingAuth }) => void;
  onError: (msg: string) => void;
};

export default function AppQrLoginPanel({ isDark, onBack, onSuccess, onError }: AppQrLoginPanelProps) {
  const [qrUrl, setQrUrl] = useState("");
  const [status, setStatus] = useState<"loading" | "waiting" | "expired">("loading");
  const tokenRef = useRef("");
  const pollRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setStatus("loading");
      const start = await startQrLogin();
      if (cancelled) return;
      if (!start.ok) {
        onError(start.error);
        onBack();
        return;
      }
      tokenRef.current = start.data.token;
      setQrUrl(start.data.qrUrl);
      setStatus("waiting");

      const result: QrLoginResult = await waitForQrLogin(start.data.token);
      if (cancelled) return;
      if (!result.ok) {
        if (result.error.includes("истёк")) setStatus("expired");
        onError(result.error);
        return;
      }
      if ("role" in result) onSuccess({ role: result.role });
      else onSuccess({ pending: result.pending });
    };

    void run();
    return () => {
      cancelled = true;
      window.clearTimeout(pollRef.current);
    };
  }, [onBack, onError, onSuccess]);

  const refresh = async () => {
    setStatus("loading");
    setQrUrl("");
    const start = await startQrLogin();
    if (!start.ok) {
      onError(start.error);
      return;
    }
    tokenRef.current = start.data.token;
    setQrUrl(start.data.qrUrl);
    setStatus("waiting");
    const result = await waitForQrLogin(start.data.token);
    if (!result.ok) {
      if (result.error.includes("истёк")) setStatus("expired");
      onError(result.error);
      return;
    }
    if ("role" in result) onSuccess({ role: result.role });
    else onSuccess({ pending: result.pending });
  };

  const muted = isDark ? "text-zinc-400" : "text-gray-500";
  const textPrimary = isDark ? "text-zinc-100" : "text-gray-900";

  return (
    <div className="flex flex-1 flex-col">
      <button
        type="button"
        onClick={onBack}
        className={`mb-6 inline-flex items-center gap-1.5 text-sm ${muted} hover:opacity-80`}
      >
        <ChevronLeftIcon />
        Назад
      </button>

      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <h1 className={`mb-2 text-2xl font-bold tracking-tight ${textPrimary}`}>Вход по QR-коду</h1>
        <p className={`mb-8 max-w-xs text-sm ${muted}`}>
          Откройте MiniKBP на телефоне, где вы уже вошли, и отсканируйте код
        </p>

        <div className="mb-6 flex min-h-[min(72vw,280px)] w-[min(72vw,280px)] items-center justify-center">
          {qrUrl ? (
            <ProfileQrCode value={qrUrl} size={280} bare isDark={isDark} />
          ) : (
            <div className={`text-sm ${muted}`}>Генерируем код…</div>
          )}
        </div>

        <p className={`text-sm ${muted}`}>
          {status === "loading" ? "Подготовка…" : status === "expired" ? "Код истёк" : "Ожидаем сканирование…"}
        </p>

        {status === "expired" ? (
          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-4 rounded-full bg-[#3390ec] px-5 py-2.5 text-sm font-semibold text-white"
          >
            Обновить QR
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ChevronLeftIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}
