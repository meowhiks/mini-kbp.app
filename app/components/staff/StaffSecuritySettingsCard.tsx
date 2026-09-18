"use client";

import { useEffect, useState } from "react";
import { loadStaffSession } from "@/lib/client/miniKbpServer";
import { getServerUrl } from "@/lib/client/serverUrl";
import { formatRelativePastRu } from "@/lib/client/formatRelativeRu";

type Settings = {
  lock_enabled: boolean;
  idle_lock_minutes: number;
  has_pin: boolean;
  pin_updated_at: string | null;
};

type StaffSecuritySettingsCardProps = {
  variant?: "light" | "dark";
};

async function staffApi(path: string, init: RequestInit = {}) {
  const session = await loadStaffSession();
  const url = getServerUrl();
  if (!session || !url) return { ok: false, data: {} };
  const resp = await fetch(`${url.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access}`,
      ...(init.headers || {}),
    },
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, data };
}

export default function StaffSecuritySettingsCard({ variant = "light" }: StaffSecuritySettingsCardProps) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const isDark = variant === "dark";

  useEffect(() => {
    void staffApi("/v0/staff-security/settings/").then((r) => {
      if (r.ok) setSettings(r.data as Settings);
    });
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage("");
    const body: Record<string, unknown> = {
      lock_enabled: settings?.lock_enabled ?? false,
      idle_lock_minutes: settings?.idle_lock_minutes ?? 5,
    };
    if (pin.trim()) body.pin = pin.trim();
    const r = await staffApi("/v0/staff-security/settings/", {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!r.ok) {
      setMessage(typeof r.data?.detail === "string" ? r.data.detail : "Ошибка сохранения");
      return;
    }
    setPin("");
    setMessage("Сохранено");
    const refreshed = await staffApi("/v0/staff-security/settings/");
    if (refreshed.ok) setSettings(refreshed.data as Settings);
  };

  if (!settings) return null;

  const inputCls = isDark
    ? "mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
    : "mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm";
  const labelCls = isDark ? "mt-2 block text-xs text-zinc-400" : "mt-2 block text-xs text-gray-600";

  return (
    <div className={isDark ? "rounded-xl border border-zinc-700 bg-zinc-900/50 p-4" : "rounded-xl border border-gray-200 bg-white p-4"}>
      <h3 className={`text-sm font-semibold ${isDark ? "text-zinc-100" : "text-gray-900"}`}>Блокировка сеанса</h3>
      <p className={`mt-1 text-xs ${isDark ? "text-zinc-500" : "text-gray-500"}`}>
        PIN один на все устройства. Изменён {formatRelativePastRu(settings.pin_updated_at)}.
      </p>
      <label className={`mt-3 flex items-center gap-2 text-sm ${isDark ? "text-zinc-200" : ""}`}>
        <input
          type="checkbox"
          checked={settings.lock_enabled}
          onChange={(e) => setSettings({ ...settings, lock_enabled: e.target.checked })}
        />
        Включить блокировку
      </label>
      <label className={labelCls}>
        Автоблокировка, мин
        <input
          type="number"
          min={1}
          max={120}
          value={settings.idle_lock_minutes}
          onChange={(e) =>
            setSettings({ ...settings, idle_lock_minutes: Number(e.target.value) || 5 })
          }
          className={inputCls}
        />
      </label>
      <label className={labelCls}>
        {settings.has_pin ? "Новый PIN (оставьте пустым, чтобы не менять)" : "PIN (4–8 цифр)"}
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
          className={`${inputCls} tracking-widest`}
          placeholder="••••"
        />
      </label>
      {message ? (
        <p className={`mt-2 text-xs ${isDark ? "text-zinc-400" : "text-gray-600"}`}>{message}</p>
      ) : null}
      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="mt-3 rounded-xl bg-[#3390ec] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Сохранить
      </button>
    </div>
  );
}
