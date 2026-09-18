"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiUrl } from "@/lib/client/apiPath";
import { getServerUrl } from "@/lib/client/serverUrl";
import { loadStaffSession } from "@/lib/client/miniKbpServer";
import { AppInputField, appInputClassPlain } from "@/app/components/app/AppInputField";
import { themeIsDark, type AppTheme } from "@/lib/client/appTheme";
import {
  composeDisplayName,
  parseDisplayName,
  type DisplayNameParts,
} from "@/lib/client/displayNameParts";
import { createAutosaveScheduler } from "@/lib/client/adminAutosave";

export type StaffStudentProfile = {
  student_id: number;
  full_name: string;
  record_book_number: string;
  has_app_account: boolean;
  email: string;
  phone: string;
  display_name: string;
  nickname: string;
  info: string;
  gender: string;
  avatar_url: string;
  telegram_username?: string;
  profile_locked: boolean;
  profile_locked_at: string | null;
  profile_locked_by_name: string | null;
  can_edit_fio: boolean;
};

type Props = {
  studentId: number;
  studentName: string;
  theme?: AppTheme;
  liftAboveNav?: boolean;
  onClose: () => void;
  onSaved?: (fullName: string) => void;
};

export default function TeacherStudentProfileModal({
  studentId,
  studentName,
  theme = "light",
  liftAboveNav = false,
  onClose,
  onSaved,
}: Props) {
  const [data, setData] = useState<StaffStudentProfile | null>(null);
  const [fio, setFio] = useState<DisplayNameParts>({ lastName: "", firstName: "", patronymic: "" });
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [loading, setLoading] = useState(true);
  const autosave = useRef(createAutosaveScheduler());
  const dataRef = useRef(data);
  dataRef.current = data;
  const fioRef = useRef(fio);
  fioRef.current = fio;

  useEffect(() => () => autosave.current.cancel(), []);

  const load = async () => {
    setLoading(true);
    setError("");
    const staff = await loadStaffSession();
    if (!staff?.access) {
      setError("Нет сессии преподавателя");
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(apiUrl(getServerUrl(), `staff/students/${studentId}/app-profile/`), {
        headers: { Authorization: `Bearer ${staff.access}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body.detail === "string" ? body.detail : `Ошибка ${res.status}`);
        setLoading(false);
        return;
      }
      const profile = body as StaffStudentProfile;
      setData(profile);
      setFio(parseDisplayName(profile.display_name || profile.full_name || ""));
    } catch {
      setError("Сервер недоступен");
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [studentId]);

  const patch = async (payload: Record<string, unknown>, closeAfter = false) => {
    setError("");
    setOk("");
    const staff = await loadStaffSession();
    if (!staff?.access) {
      setError("Нет сессии");
      return false;
    }
    try {
      const res = await fetch(apiUrl(getServerUrl(), `staff/students/${studentId}/app-profile/`), {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${staff.access}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body.detail === "string" ? body.detail : `Ошибка ${res.status}`);
        return false;
      }
      const profile = body as StaffStudentProfile;
      if ("profile_locked" in payload) {
        setData(profile);
      }
      const savedName = profile.display_name || profile.full_name || composeDisplayName(fioRef.current);
      setOk("Сохранено");
      onSaved?.(savedName);
      if (closeAfter) {
        window.setTimeout(onClose, 500);
      }
      return true;
    } catch {
      setError("Сервер недоступен");
      return false;
    }
  };

  const queueProfileSave = () => {
    const current = dataRef.current;
    if (!current) return;
    const payload: Record<string, unknown> = {};
    if (current.can_edit_fio) payload.display_name = composeDisplayName(fioRef.current);
    if (current.has_app_account) {
      payload.phone = current.phone;
      payload.info = current.info;
    }
    if (Object.keys(payload).length === 0) return;
    autosave.current.schedule(1, payload, () => {
      void patch(payload).finally(() => autosave.current.pendingIds.delete(1));
    });
  };

  const isDark = themeIsDark(theme);
  const inputCls = `${appInputClassPlain(isDark)} ${isDark ? "[color-scheme:dark]" : ""}`;
  const canEditFio = data?.can_edit_fio ?? false;
  const navPad = liftAboveNav ? "pb-[calc(3.25rem+env(safe-area-inset-bottom,0px)+0.75rem)]" : "";

  const modal = (
    <div
      className={`fixed inset-0 z-[300] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4 ${navPad}`}
      onClick={onClose}
    >
      <div
        className={`max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl p-5 shadow-xl sm:rounded-2xl ${
          isDark ? "bg-zinc-900 text-zinc-100" : "bg-white"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className={`text-lg font-semibold ${isDark ? "text-zinc-50" : "text-gray-900"}`}>{studentName}</h2>
            <p className={`text-xs ${isDark ? "text-zinc-400" : "text-gray-500"}`}>
              Профиль студента · изменения сохраняются сами
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`text-sm ${isDark ? "text-zinc-500 hover:text-zinc-200" : "text-gray-400 hover:text-gray-700"}`}
          >
            Закрыть
          </button>
        </div>

        {loading ? <p className={`text-sm ${isDark ? "text-zinc-400" : "text-gray-500"}`}>Загрузка…</p> : null}
        {error ? <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p> : null}
        {ok ? <p className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{ok}</p> : null}

        {data ? (
          <div className="space-y-3">
            {!data.has_app_account ? (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Нет аккаунта ЛК — редактируется только карточка студента.
              </p>
            ) : null}

            {!canEditFio ? (
              <p className="rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600">
                ФИО может изменять только куратор группы.
              </p>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-3">
              <label className={`block text-xs ${isDark ? "text-zinc-400" : "text-gray-500"}`}>
                Фамилия
                <AppInputField>
                  <input
                    className={inputCls}
                    value={fio.lastName}
                    disabled={!canEditFio}
                    onChange={(e) => {
                      const next = { ...fio, lastName: e.target.value };
                      fioRef.current = next;
                      setFio(next);
                      queueProfileSave();
                    }}
                    placeholder="Иванов"
                  />
                </AppInputField>
              </label>
              <label className={`block text-xs ${isDark ? "text-zinc-400" : "text-gray-500"}`}>
                Имя
                <AppInputField>
                  <input
                    className={inputCls}
                    value={fio.firstName}
                    disabled={!canEditFio}
                    onChange={(e) => {
                      const next = { ...fio, firstName: e.target.value };
                      fioRef.current = next;
                      setFio(next);
                      queueProfileSave();
                    }}
                    placeholder="Иван"
                  />
                </AppInputField>
              </label>
              <label className={`block text-xs ${isDark ? "text-zinc-400" : "text-gray-500"}`}>
                Отчество
                <AppInputField>
                  <input
                    className={inputCls}
                    value={fio.patronymic}
                    disabled={!canEditFio}
                    onChange={(e) => {
                      const next = { ...fio, patronymic: e.target.value };
                      fioRef.current = next;
                      setFio(next);
                      queueProfileSave();
                    }}
                    placeholder="Иванович"
                  />
                </AppInputField>
              </label>
            </div>

            {data.has_app_account ? (
              <>
                <AppInputField>
                  <input
                    className={inputCls}
                    value={data.phone}
                    onChange={(e) => {
                      const next = { ...data, phone: e.target.value };
                      dataRef.current = next;
                      setData(next);
                      queueProfileSave();
                    }}
                    placeholder="Телефон"
                  />
                </AppInputField>
                <AppInputField>
                  <textarea
                    className={inputCls}
                    rows={3}
                    value={data.info}
                    onChange={(e) => {
                      const next = { ...data, info: e.target.value };
                      dataRef.current = next;
                      setData(next);
                      queueProfileSave();
                    }}
                    placeholder="О себе"
                  />
                </AppInputField>

                <label
                  className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm ${
                    isDark ? "bg-zinc-800 text-zinc-100" : "bg-[#f0f0f0]"
                  }`}
                >
                  <span>
                    Заблокировать изменение данных
                    {data.profile_locked_by_name ? (
                      <span className={`mt-0.5 block text-xs ${isDark ? "text-zinc-400" : "text-gray-500"}`}>
                        {data.profile_locked_by_name}
                        {data.profile_locked_at
                          ? ` · ${new Date(data.profile_locked_at).toLocaleString("ru-RU")}`
                          : ""}
                      </span>
                    ) : null}
                  </span>
                  <input
                    type="checkbox"
                    checked={data.profile_locked}
                    onChange={(e) => void patch({ profile_locked: e.target.checked })}
                  />
                </label>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}
