"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { adminBtnPrimary, adminBtnOutline, adminBtnDanger, adminInput } from "@/app/components/staff/AdminShell";
import {
  composeDisplayName,
  parseDisplayName,
  type DisplayNameParts,
} from "@/lib/client/displayNameParts";
import {
  fetchGroups,
  updateAppAccount,
  deleteAppAccount,
  type AppAccountRecord,
  type AppAccountUpdatePayload,
  type GroupRecord,
  type StaffSession,
} from "@/lib/client/miniKbpServer";

type AppAccountEditModalProps = {
  account: AppAccountRecord;
  session: StaffSession;
  onClose: () => void;
  onSaved: (account: AppAccountRecord) => void;
  onDeleted?: (id: number) => void;
};

function accountInitials(account: AppAccountRecord): string {
  const src = account.display_name || account.label || account.email || "?";
  const parts = src.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export default function AppAccountEditModal({ account, session, onClose, onSaved, onDeleted }: AppAccountEditModalProps) {
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const initialFio = useMemo(() => parseDisplayName(account.display_name), [account.display_name]);
  const [fio, setFio] = useState<DisplayNameParts>(initialFio);
  const [form, setForm] = useState({
    nickname: account.nickname,
    phone: account.phone,
    gender: account.gender || "",
    info: account.info || "",
    show_group: account.show_group,
    profile_locked: account.profile_locked,
    is_active: account.is_active,
    session_ttl_days: String(account.session_ttl_days || 30),
    group_id: account.group_id ? String(account.group_id) : "",
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    void fetchGroups(session).then(setGroups);
  }, [session]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const save = async () => {
    setBusy(true);
    setError("");
    const payload: AppAccountUpdatePayload = {
      display_name: composeDisplayName(fio),
      nickname: form.nickname.trim(),
      phone: form.phone.trim(),
      gender: form.gender,
      info: form.info.trim(),
      show_group: form.show_group,
      profile_locked: form.profile_locked,
      is_active: form.is_active,
      session_ttl_days: Number(form.session_ttl_days) || 30,
      group_id: form.group_id ? Number(form.group_id) : null,
    };
    const r = await updateAppAccount(session, account.id, payload);
    setBusy(false);
    if (!r.ok) {
      setError(r.detail);
      return;
    }
    onSaved(r.data);
    onClose();
  };

  const remove = async () => {
    if (!confirm("Удалить этот аккаунт безвозвратно?")) return;
    setBusy(true);
    setError("");
    const r = await deleteAppAccount(session, account.id);
    setBusy(false);
    if (!r.ok) {
      setError(r.detail);
      return;
    }
    onSaved({ ...account, is_active: false, label: account.label });
    onDeleted?.(account.id);
    onClose();
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/45 p-4 sm:items-center" onClick={onClose} role="presentation">
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-account-edit-title"
      >
        <div className="mb-5 flex items-start gap-4">
          {account.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={account.avatar_url} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gray-100 text-lg font-semibold text-gray-600">
              {accountInitials(account)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 id="app-account-edit-title" className="text-lg font-semibold text-gray-900">
              Редактирование профиля
            </h2>
            <p className="mt-0.5 truncate text-sm text-gray-500">{account.email || account.label}</p>
            {account.telegram_username ? (
              <p className="text-xs text-gray-400">@{account.telegram_username}</p>
            ) : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Закрыть">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">ФИО</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-xs text-gray-500">Фамилия</span>
                <input
                  value={fio.lastName}
                  onChange={(e) => setFio((prev) => ({ ...prev, lastName: e.target.value }))}
                  className={adminInput}
                  maxLength={80}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-gray-500">Имя</span>
                <input
                  value={fio.firstName}
                  onChange={(e) => setFio((prev) => ({ ...prev, firstName: e.target.value }))}
                  className={adminInput}
                  maxLength={80}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-gray-500">Отчество</span>
                <input
                  value={fio.patronymic}
                  onChange={(e) => setFio((prev) => ({ ...prev, patronymic: e.target.value }))}
                  className={adminInput}
                  maxLength={80}
                />
              </label>
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Никнейм</span>
            <input
              value={form.nickname}
              onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))}
              className={adminInput}
              maxLength={64}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">Телефон</span>
              <input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className={adminInput}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">Пол</span>
              <select
                value={form.gender}
                onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
                className={adminInput}
              >
                <option value="">Не указан</option>
                <option value="male">Мужской</option>
                <option value="female">Женский</option>
                <option value="other">Другой</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">О себе</span>
            <textarea
              value={form.info}
              onChange={(e) => setForm((f) => ({ ...f, info: e.target.value }))}
              rows={3}
              maxLength={2000}
              className={`${adminInput} resize-none`}
              placeholder="Коротко о себе…"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Группа</span>
            <select
              value={form.group_id}
              onChange={(e) => setForm((f) => ({ ...f, group_id: e.target.value }))}
              className={adminInput}
            >
              <option value="">—</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Срок сессии</span>
            <select
              value={form.session_ttl_days}
              onChange={(e) => setForm((f) => ({ ...f, session_ttl_days: e.target.value }))}
              className={adminInput}
            >
              <option value="7">7 дней</option>
              <option value="14">14 дней</option>
              <option value="30">30 дней</option>
              <option value="90">90 дней</option>
              <option value="180">180 дней</option>
              <option value="365">365 дней</option>
            </select>
          </label>

          <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <label className="flex items-start justify-between gap-3 text-sm text-gray-700">
              <span>
                Аккаунт активен
                <span className="mt-0.5 block text-xs font-normal text-gray-500">При выключении все сессии будут завершены</span>
              </span>
              <input
                type="checkbox"
                className="mt-1"
                checked={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              />
            </label>
            <label className="flex items-start justify-between gap-3 text-sm text-gray-700">
              <span>
                Заблокировать редактирование профиля
                <span className="mt-0.5 block text-xs font-normal text-gray-500">
                  Пользователь не сможет менять ФИО, телефон и «О себе», как при блокировке преподавателем
                </span>
              </span>
              <input
                type="checkbox"
                className="mt-1"
                checked={form.profile_locked}
                onChange={(e) => setForm((f) => ({ ...f, profile_locked: e.target.checked }))}
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm text-gray-700">
              <span>Показывать группу в профиле</span>
              <input
                type="checkbox"
                checked={form.show_group}
                onChange={(e) => setForm((f) => ({ ...f, show_group: e.target.checked }))}
              />
            </label>
          </div>
        </div>

        {error ? <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <button type="button" className={adminBtnDanger} onClick={() => void remove()} disabled={busy}>
            {busy ? "Удаляем…" : "Удалить аккаунт"}
          </button>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={adminBtnOutline} onClick={onClose} disabled={busy}>
              Отмена
            </button>
            <button type="button" className={adminBtnPrimary} onClick={() => void save()} disabled={busy}>
              {busy ? "Сохраняем…" : "Сохранить"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function AppAccountAvatar({ account, size = "md" }: { account: AppAccountRecord; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm";
  if (account.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={account.avatar_url} alt="" className={`${dim} shrink-0 rounded-full object-cover`} />
    );
  }
  return (
    <div className={`${dim} flex shrink-0 items-center justify-center rounded-full bg-gray-100 font-semibold text-gray-600`}>
      {accountInitials(account)}
    </div>
  );
}
