"use client";

import { useEffect, useState } from "react";
import type { AppTheme } from "@/lib/client/appTheme";
import { themeIsDark } from "@/lib/client/appTheme";
import { isExtensionAvailable } from "@/lib/client/extensionBridge";
import {
  broadcastConsentToExtension,
  getRelayConsent,
  setRelayConsentAccepted,
  revokeRelayConsent,
} from "@/lib/client/relayConsent";

type RelayConsentSectionProps = {
  theme: AppTheme;
  accepted: boolean;
  onAcceptedChange: (v: boolean) => void;
};

export default function RelayConsentSection({ theme, accepted, onAcceptedChange }: RelayConsentSectionProps) {
  const isDark = themeIsDark(theme);
  const [extensionOk, setExtensionOk] = useState(false);
  const [ackRequired, setAckRequired] = useState(false);
  const [ackChecked, setAckChecked] = useState(false);

  useEffect(() => {
    setExtensionOk(isExtensionAvailable());
    const t = window.setInterval(() => setExtensionOk(isExtensionAvailable()), 2000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    getRelayConsent().then((c) => {
      if (c) broadcastConsentToExtension(c);
    });
  }, []);

  const handleToggle = async (next: boolean) => {
    if (next) {
      if (!ackChecked) {
        setAckRequired(true);
        return;
      }
      const consent = await setRelayConsentAccepted(true);
      onAcceptedChange(true);
      broadcastConsentToExtension(consent);
      setAckRequired(false);
      return;
    }

    await revokeRelayConsent();
    onAcceptedChange(false);
    setAckChecked(false);
  };

  const labelPrimary = `text-sm ${isDark ? "text-zinc-100" : "text-gray-900"}`;
  const labelSecondary = `text-sm ${isDark ? "text-zinc-400" : "text-gray-500"}`;

  return (
    <>
      <p className={`px-4 py-3 text-xs leading-relaxed ${labelSecondary}`}>
        Сервер MiniKBP иногда не может достучаться до kbp.by. Участники сети с вашего согласия помогают
        загружать данные через свой браузер (только домен kbp.by). Вы можете отключить это
        в любой момент.
      </p>

      <label className={`flex items-start gap-3 border-t px-4 py-3.5 ${isDark ? "border-zinc-800" : "border-gray-100"}`}>
        <input
          type="checkbox"
          checked={ackChecked}
          onChange={(e) => {
            setAckChecked(e.target.checked);
            if (e.target.checked) setAckRequired(false);
          }}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-[#3390ec] focus:ring-[#3390ec]"
        />
        <span className={`text-xs leading-relaxed ${labelPrimary}`}>
          Я понимаю: мой браузер может выполнять запросы к kbp.by от имени MiniKBP, только
          для расписания. Данные третьих лиц не передаются.
        </span>
      </label>

      {ackRequired ? (
        <p className="px-4 pb-2 text-xs text-amber-600 dark:text-amber-400">Отметьте согласие выше, чтобы включить.</p>
      ) : null}

      <label className={`flex items-center justify-between gap-4 border-t px-4 py-3.5 ${isDark ? "border-zinc-800" : "border-gray-100"}`}>
        <div>
          <div className={labelPrimary}>Участвовать в сети</div>
          <div className={labelSecondary}>
            {extensionOk ? "Расширение установлено" : "Нужно расширение Chrome (см. ниже)"}
          </div>
        </div>
        <ToggleMini checked={accepted} onChange={handleToggle} isDark={isDark} />
      </label>

      <div className={`border-t px-4 py-3.5 text-xs ${labelSecondary} ${isDark ? "border-zinc-800" : "border-gray-100"}`}>
        <p className="mb-2 font-medium text-[#3390ec]">Расширение для Chrome</p>
        <p className="mb-2">
          Веб-страница не может обойти CORS — нужно расширение из папки <code className="text-[11px]">extension/</code>{" "}
          (Chrome → Расширения → Загрузить распакованное).
        </p>
        {!extensionOk && accepted ? (
          <p className="text-amber-600 dark:text-amber-400">Согласие включено, но расширение не обнаружено.</p>
        ) : null}
      </div>
    </>
  );
}

function ToggleMini({
  checked,
  onChange,
  isDark,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  isDark?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[28px] w-[50px] shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-[#3390ec]" : isDark ? "bg-zinc-700" : "bg-gray-200"
      }`}
      aria-pressed={checked}
    >
      <span
        className={`inline-block h-[22px] w-[22px] transform rounded-full bg-white transition-transform ${
          checked ? "translate-x-[24px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
}
