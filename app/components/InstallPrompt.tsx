"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  isIos,
  isMobileBrowser,
  isNativeApp,
  isStandalonePwa,
} from "@/lib/client/platform";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "minikbp_install_dismissed";

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export default function InstallPrompt() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (pathname !== "/app") return;
    if (isNativeApp() || isStandalonePwa() || wasDismissed()) return;
    if (!isMobileBrowser()) return;

    if (isIos()) {
      setIosHint(true);
      setVisible(true);
      return;
    }

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, [pathname]);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    dismiss();
  };

  if (!visible) return null;

  return (
    <div className="install-prompt fixed inset-x-0 bottom-[4.5rem] z-50 px-4 pb-2 md:bottom-4">
      <div className="install-prompt-card mx-auto flex max-w-lg items-start gap-3 rounded-2xl border border-gray-200/90 bg-white/95 p-4 shadow-[0_8px_32px_rgba(15,23,42,0.14)] backdrop-blur-md dark:border-slate-700 dark:bg-slate-900/95">
        <Image src="/minikbp.svg" alt="" width={36} height={36} className="mt-0.5 h-9 w-9 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Добавьте на экран</p>
          <p className="mt-0.5 text-xs leading-relaxed text-gray-500 dark:text-slate-400">
            {iosHint ? (
              <>
                В Safari: нажмите{" "}
                <span className="inline-flex align-middle" aria-hidden="true">
                  <svg viewBox="0 0 24 24" className="mx-0.5 inline h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 3v12M8 11l4 4 4-4M5 21h14" />
                  </svg>
                </span>{" "}
                «Поделиться» → «На экран Домой».
              </>
            ) : (
              "Установите ярлык — расписание и журнал откроются в один тап."
            )}
          </p>
          {!iosHint && deferred ? (
            <button
              type="button"
              onClick={install}
              className="mt-2.5 rounded-xl bg-[#3390ec] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#2d7fd6]"
            >
              Установить
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-800"
          aria-label="Закрыть"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
