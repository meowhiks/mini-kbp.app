"use client";

import { useEffect, useState } from "react";
import { clearStaffSession, loadStaffSession } from "@/lib/client/miniKbpServer";
import { getLkLoginUrl } from "@/lib/client/lkAppUrl";
import { getServerUrl } from "@/lib/client/serverUrl";
import { formatRelativePastRu } from "@/lib/client/formatRelativeRu";

type Status = {
  locked: boolean;
  lock_enabled: boolean;
  idle_lock_minutes: number | null;
  has_pin: boolean;
  pin_updated_at: string | null;
  has_push: boolean;
};

async function api(path: string, init: RequestInit = {}) {
  const session = await loadStaffSession();
  const url = getServerUrl();
  if (!session || !url) return { ok: false as const, status: 0, data: {} as Record<string, unknown> };
  const resp = await fetch(`${url.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access}`,
      ...(init.headers || {}),
    },
    credentials: "include",
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data };
}

export default function SessionLockOverlay() {
  const [status, setStatus] = useState<Status | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [forgotConfirm, setForgotConfirm] = useState(false);

  const refresh = async () => {
    const r = await api("/v0/staff-security/status/");
    if (r.ok) setStatus(r.data as Status);
  };

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        if (!cancelled) await refresh();
      } catch {
        /* ignore */
      }
    };
    void tick();
    const id = window.setInterval(tick, 8000);
    const onActivity = () => {
      void api("/v0/staff-security/activity/", { method: "POST", body: "{}" }).catch(() => {});
    };
    const onLock = () => {
      setStatus((prev) => (prev ? { ...prev, locked: true } : prev));
      void refresh();
    };
    window.addEventListener("pointerdown", onActivity);
    window.addEventListener("keydown", onActivity);
    window.addEventListener("minikbp-staff-lock", onLock);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("minikbp-staff-lock", onLock);
    };
  }, []);

  if (!status?.locked) return null;

  const unlock = async () => {
    setError("");
    const pinLike = /^\d{4,8}$/.test(password.trim());
    const r = pinLike
      ? await api("/v0/staff-security/unlock/", { method: "POST", body: JSON.stringify({ pin: password.trim() }) })
      : await api("/v0/staff-security/unlock-password/", {
          method: "POST",
          body: JSON.stringify({ password }),
        });
    if (!r.ok) {
      setError(typeof r.data?.detail === "string" ? r.data.detail : "Не удалось разблокировать");
      return;
    }
    setStatus({ ...status, locked: false });
    setPassword("");
    setForgotConfirm(false);
  };

  const wipeSession = async () => {
    await api("/v0/auth/logout/", { method: "POST", body: "{}" }).catch(() => {});
    await clearStaffSession();
    window.location.replace(getLkLoginUrl());
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/55 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
        <h2 className="font-montserrat text-lg font-bold text-neutral-950">Сеанс заблокирован</h2>
        {forgotConfirm ? (
          <>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">
              Сессия на этом устройстве будет удалена, вход придётся пройти заново. Продолжить?
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white"
                onClick={() => void wipeSession()}
              >
                Удалить сессию
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl bg-neutral-100 py-2.5 text-sm font-semibold text-neutral-800"
                onClick={() => setForgotConfirm(false)}
              >
                Отмена
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-neutral-500">Введите пароль</p>
            {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void unlock();
              }}
              className="mt-4 w-full rounded-xl border-0 bg-[#f0f0f0] px-4 py-3"
              placeholder="Пароль или PIN"
              autoFocus
            />
            <button
              type="button"
              onClick={() => void unlock()}
              className="mt-4 w-full rounded-xl bg-[#3390ec] py-3 text-sm font-semibold text-white"
            >
              Разблокировать
            </button>
            <button
              type="button"
              className="mt-3 w-full text-sm text-[#3390ec]"
              onClick={() => setForgotConfirm(true)}
            >
              Забыли пинкод?
            </button>
            <p className="mt-4 text-center text-xs text-neutral-400">
              PIN изменён {formatRelativePastRu(status.pin_updated_at)}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
