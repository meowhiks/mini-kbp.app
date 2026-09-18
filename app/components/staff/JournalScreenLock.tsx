"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  JOURNAL_LOCK_DURATIONS,
  formatCountdown,
  isValidPin,
  msUntilUnlock,
  parseCustomLockMinutes,
  startJournalLock,
  unlockJournalWithPin,
  type JournalScreenLockState,
  type LockDurationOption,
} from "@/lib/client/journalScreenLock";

type JournalScreenLockSetupProps = {
  open: boolean;
  isDark: boolean;
  teacherId: number | null | undefined;
  /** Поднять лист над нижней навигацией приложения */
  liftAboveNav?: boolean;
  onClose: () => void;
  onLocked: (state: JournalScreenLockState) => void;
};

export function JournalScreenLockSetup({
  open,
  isDark,
  teacherId,
  liftAboveNav = false,
  onClose,
  onLocked,
}: JournalScreenLockSetupProps) {
  const [duration, setDuration] = useState<LockDurationOption>(
    () => JOURNAL_LOCK_DURATIONS.find((d) => d.id === "5m") ?? JOURNAL_LOCK_DURATIONS[0]
  );
  const [customMinutes, setCustomMinutes] = useState("25");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    setDuration(JOURNAL_LOCK_DURATIONS.find((d) => d.id === "5m") ?? JOURNAL_LOCK_DURATIONS[0]);
    setCustomMinutes("25");
    setPin("");
    setPin2("");
    setError("");
    setBusy(false);
  }, [open]);

  if (!open || !mounted || typeof document === "undefined") return null;

  const inputClass = `w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-all focus:border-[#3390ec] focus:ring-1 focus:ring-[#3390ec]/25 ${
    isDark
      ? "border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500 hover:border-zinc-600"
      : "border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 hover:border-gray-300"
  }`;
  const pinClass = `${inputClass} text-center font-mono text-lg tracking-[0.35em]`;
  const muted = isDark ? "text-zinc-400" : "text-gray-500";
  const card = isDark ? "border-zinc-800 bg-zinc-900 text-zinc-100" : "border-gray-200 bg-white text-gray-900";
  const navPad = liftAboveNav
    ? "pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))]"
    : "pb-[max(1rem,env(safe-area-inset-bottom,0px))]";

  const resolveMinutes = (): number | null => {
    if (duration.custom) return parseCustomLockMinutes(customMinutes);
    return duration.minutes;
  };

  const submit = async () => {
    setError("");
    const minutes = resolveMinutes();
    if (minutes == null || minutes < 1) {
      setError("Укажите время от 1 до 240 минут");
      return;
    }
    if (!isValidPin(pin)) {
      setError("Код — 4–8 цифр");
      return;
    }
    if (pin !== pin2) {
      setError("Коды не совпадают");
      return;
    }
    setBusy(true);
    try {
      const state = await startJournalLock({
        teacherId: teacherId ?? null,
        pin,
        minutes,
      });
      onLocked(state);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось заблокировать");
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className={`fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4 ${navPad}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="journal-lock-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        aria-label="Закрыть"
        onClick={onClose}
      />
      <div
        className={`relative z-[1] mx-0 w-full max-w-md overflow-hidden rounded-t-2xl border shadow-xl sm:mx-auto sm:rounded-2xl ${card}`}
      >
        <div className="px-5 pb-5 pt-6">
          <div className="mb-5 text-center">
            <svg
              className={`mx-auto mb-3 h-8 w-8 ${isDark ? "text-zinc-300" : "text-gray-700"}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              aria-hidden
            >
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 018 0v3" />
            </svg>
            <h2 id="journal-lock-title" className="text-xl font-semibold">
              Блокировка журнала
            </h2>
          </div>

          <div className={`space-y-4 rounded-2xl border p-4 ${isDark ? "border-zinc-800 bg-zinc-950/50" : "border-gray-100 bg-gray-50/80"}`}>
            <div>
              <span className={`mb-1.5 block text-xs font-medium ${muted}`}>Время (мин)</span>
              <div className="flex flex-wrap gap-1.5">
                {JOURNAL_LOCK_DURATIONS.map((opt) => {
                  const active = duration.id === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setDuration(opt)}
                      className={`min-w-[2.5rem] rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                        active
                          ? "bg-[#3390ec] text-white"
                          : isDark
                            ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                            : "bg-white text-gray-700 ring-1 ring-gray-200 hover:border-gray-300"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {duration.custom ? (
                <input
                  type="number"
                  min={1}
                  max={240}
                  inputMode="numeric"
                  value={customMinutes}
                  onChange={(e) => setCustomMinutes(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                  className={`${inputClass} mt-2`}
                  placeholder="Минут"
                  aria-label="Своё время в минутах"
                />
              ) : null}
            </div>

            <label className="block">
              <span className={`mb-1.5 block text-xs font-medium ${muted}`}>Код</span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={8}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                className={pinClass}
                placeholder="••••"
              />
            </label>

            <label className="block">
              <span className={`mb-1.5 block text-xs font-medium ${muted}`}>Повторите код</span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={8}
                value={pin2}
                onChange={(e) => setPin2(e.target.value.replace(/\D/g, "").slice(0, 8))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit();
                }}
                className={pinClass}
                placeholder="••••"
              />
            </label>

            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
            ) : null}

            <button
              type="button"
              disabled={busy}
              onClick={() => void submit()}
              className="w-full rounded-xl bg-[#3390ec] py-3 text-sm font-semibold text-white transition hover:bg-[#2d7fd6] disabled:opacity-50"
            >
              {busy ? "Блокируем…" : "Заблокировать"}
            </button>
          </div>

          <button type="button" onClick={onClose} className={`mt-3 w-full py-2 text-sm ${muted}`}>
            Отмена
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

type JournalScreenLockOverlayProps = {
  state: JournalScreenLockState;
  isDark: boolean;
  teacherId: number | null | undefined;
  liftAboveNav?: boolean;
  onUnlocked: (state: JournalScreenLockState) => void;
};

export function JournalScreenLockOverlay({
  state,
  isDark,
  teacherId,
  liftAboveNav = false,
  onUnlocked,
}: JournalScreenLockOverlayProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [remainMs, setRemainMs] = useState(() => msUntilUnlock(state.unlockAt));

  useEffect(() => {
    setRemainMs(msUntilUnlock(state.unlockAt));
    let expired = false;
    const id = window.setInterval(() => {
      const left = msUntilUnlock(state.unlockAt);
      setRemainMs(left);
      if (!expired && state.unlockAt != null && left <= 0) {
        expired = true;
        void (async () => {
          const { expireJournalLock } = await import("@/lib/client/journalScreenLock");
          const next = await expireJournalLock(teacherId ?? null);
          onUnlocked(next);
        })();
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [state.unlockAt, teacherId, onUnlocked]);

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      const result = await unlockJournalWithPin(pin, teacherId);
      if (!result.ok) {
        setError("Неверный код");
        setPin("");
        return;
      }
      setPin("");
      onUnlocked(result.state);
    } finally {
      setBusy(false);
    }
  };

  const muted = isDark ? "text-zinc-400" : "text-gray-500";
  const inputClass = `w-full rounded-lg border px-3 py-2.5 text-center font-mono text-lg tracking-[0.35em] outline-none transition-all focus:border-[#3390ec] focus:ring-1 focus:ring-[#3390ec]/25 ${
    isDark
      ? "border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500"
      : "border-gray-200 bg-white text-gray-900 placeholder:text-gray-400"
  }`;

  return (
    <div
      className={`absolute inset-0 z-[30] flex flex-col items-center justify-center overflow-hidden ${
        liftAboveNav ? "pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))]" : ""
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="Журнал заблокирован"
    >
      <div
        className={`absolute inset-0 backdrop-blur-md ${isDark ? "bg-zinc-950/55" : "bg-white/55"}`}
        aria-hidden
      />
      <div
        className={`relative z-[1] mx-4 w-full max-w-sm overflow-hidden rounded-2xl border p-5 shadow-lg ${
          isDark ? "border-zinc-800 bg-zinc-900 text-zinc-100" : "border-gray-200 bg-white text-gray-900"
        }`}
      >
        <div className="mb-4 text-center">
          <svg
            className={`mx-auto mb-3 h-8 w-8 ${isDark ? "text-zinc-300" : "text-gray-700"}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            aria-hidden
          >
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V8a4 4 0 018 0v3" />
          </svg>
          <p className="text-lg font-semibold">Журнал заблокирован</p>
          {state.unlockAt != null ? (
            <p className="mt-2 font-mono text-3xl font-semibold tabular-nums tracking-tight text-[#3390ec]">
              {formatCountdown(remainMs)}
            </p>
          ) : null}
          <p className={`mt-1 text-[11px] ${muted}`}>до автоматической разблокировки</p>
        </div>

        <label className="mb-3 block">
          <span className={`mb-1.5 block text-xs font-medium ${muted}`}>Код</span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={8}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
            className={inputClass}
            placeholder="••••"
            aria-label="Код разблокировки"
          />
        </label>

        {error ? (
          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        ) : null}

        <button
          type="button"
          disabled={busy || !isValidPin(pin)}
          onClick={() => void submit()}
          className="w-full rounded-xl bg-[#3390ec] py-3 text-sm font-semibold text-white transition hover:bg-[#2d7fd6] disabled:opacity-40"
        >
          {busy ? "Проверяем…" : "Войти"}
        </button>
      </div>
    </div>
  );
}

export function JournalLockIconButton({
  isDark,
  onClick,
  locked,
}: {
  isDark: boolean;
  onClick: () => void;
  locked?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={locked ? "Журнал заблокирован" : "Заблокировать журнал"}
      aria-label={locked ? "Журнал заблокирован" : "Заблокировать журнал"}
      className={`shrink-0 p-1 transition-opacity hover:opacity-70 ${
        isDark ? "text-zinc-400" : "text-gray-500"
      }`}
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d={locked ? "M8 11V8a4 4 0 018 0v3" : "M8 11V8a4 4 0 017.9-1"} />
      </svg>
    </button>
  );
}
