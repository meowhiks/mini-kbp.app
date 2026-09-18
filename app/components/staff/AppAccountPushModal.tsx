"use client";

import { useState } from "react";
import { AdminAlert } from "@/app/components/staff/AdminShell";
import type { AppAccountRecord, StaffSession } from "@/lib/client/miniKbpServer";
import { sendAppAccountPush } from "@/lib/client/miniKbpServer";

type AppAccountPushModalProps = {
  account: AppAccountRecord;
  session: StaffSession;
  onClose: () => void;
  onSent?: (message: string) => void;
};

export default function AppAccountPushModal({ account, session, onClose, onSent }: AppAccountPushModalProps) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    const text = body.trim();
    if (!text) {
      setError("Введите текст уведомления");
      return;
    }
    setBusy(true);
    setError("");
    const r = await sendAppAccountPush(session, account.id, text);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onSent?.(`Отправлено на ${r.sent} устройств${r.sent === 1 ? "" : r.sent < 5 ? "а" : ""}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Push на Android</h2>
            <p className="mt-1 text-sm text-gray-500">{account.label}</p>
          </div>
          <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            Android
          </span>
        </div>

        {error ? <AdminAlert error={error} /> : null}

        <label className="mt-3 block text-sm font-medium text-gray-700">От кого</label>
        <input
          type="text"
          value="Администратор"
          readOnly
          className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600"
        />

        <label className="mt-3 block text-sm font-medium text-gray-700">Сообщение</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          maxLength={1000}
          placeholder="Текст уведомления"
          className="mt-1 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
        />

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || !body.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Отправка…" : "Отправить"}
          </button>
        </div>
      </div>
    </div>
  );
}
