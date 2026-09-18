"use client";

import type { AppTheme } from "@/lib/client/appTheme";
import { themeIsDark } from "@/lib/client/appTheme";
import type { Group } from "@/lib/client/kbpApi";

export type LoginHistoryItem = {
  id: string;
  surname: string;
  date: string;
  group: string;
  groupName: string;
  at: number;
};

export type JournalLoginFormProps = {
  theme: AppTheme;
  surname: string;
  date: string;
  group: string;
  groupSearch: string;
  groups: Group[];
  loading: boolean;
  loadingGroups: boolean;
  groupsNotice: string;
  error: string;
  loginHistory: LoginHistoryItem[];
  onSurnameChange: (v: string) => void;
  onDateChange: (v: string) => void;
  onGroupChange: (id: string, name?: string) => void;
  onGroupSearchChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onPickHistory: (item: LoginHistoryItem) => void;
  onRemoveHistory: (id: string) => void;
};

export default function JournalLoginForm({
  theme,
  surname,
  date,
  group,
  groupSearch,
  groups,
  loading,
  loadingGroups,
  groupsNotice,
  error,
  loginHistory,
  onSurnameChange,
  onDateChange,
  onGroupChange,
  onGroupSearchChange,
  onSubmit,
  onPickHistory,
  onRemoveHistory,
}: JournalLoginFormProps) {
  const isDark = themeIsDark(theme);
  const filtered = groups.filter(
    (g) => !groupSearch.trim() || g.name.toLowerCase().includes(groupSearch.toLowerCase())
  );

  const inputClass = `w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-all focus:border-[#3390ec] focus:ring-1 focus:ring-[#3390ec]/25 ${
    isDark
      ? "border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500 hover:border-zinc-600"
      : "border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 hover:border-gray-300"
  }`;

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-8">
      <div className="mb-8 text-center">
        <div
          className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${
            isDark ? "bg-[#3390ec]/15" : "bg-[#3390ec]/10"
          }`}
        >
          <svg className="h-7 w-7 text-[#3390ec]" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M4 2h12a4 4 0 0 1 4 4v14a2 2 0 0 1-2 2H6a4 4 0 0 1-4-4V4a2 2 0 0 1 2-2Zm0 2v14a2 2 0 0 0 2 2h12V6a2 2 0 0 0-2-2H4Zm3 3h8v2H7V7Zm0 4h8v2H7v-2Zm0 4h6v2H7v-2Z" />
          </svg>
        </div>
        <h2 className={`text-xl font-semibold ${isDark ? "text-zinc-50" : "text-gray-900"}`}>
          Электронный журнал
        </h2>
      </div>

      <form onSubmit={onSubmit} className="w-full max-w-md space-y-4">
        <div
          className={`rounded-2xl border p-5 space-y-4 ${
            isDark ? "border-zinc-800 bg-zinc-900/80" : "border-gray-200 bg-white"
          }`}
        >
          <label className="block">
            <span className={`mb-1.5 block text-xs font-medium ${isDark ? "text-zinc-400" : "text-gray-500"}`}>
              Фамилия
            </span>
            <input
              type="text"
              value={surname}
              onChange={(e) => onSurnameChange(e.target.value)}
              className={inputClass}
              placeholder="Иванов"
              required
              autoComplete="family-name"
              autoFocus
            />
          </label>

          <label className="block">
            <span className={`mb-1.5 block text-xs font-medium ${isDark ? "text-zinc-400" : "text-gray-500"}`}>
              Дата рождения
            </span>
            <input
              type="text"
              value={date}
              onChange={(e) => onDateChange(e.target.value)}
              className={inputClass}
              placeholder="ДД.ММ.ГГГГ"
              inputMode="numeric"
              maxLength={10}
              required
            />
          </label>

          <div>
            <span className={`mb-1.5 block text-xs font-medium ${isDark ? "text-zinc-400" : "text-gray-500"}`}>
              Группа
            </span>
            {loadingGroups ? (
              <div className={`${inputClass} opacity-50 flex items-center`}>
                <span className="text-xs">Загрузка групп…</span>
              </div>
            ) : (
              <div className="relative group">
                <select
                  value={group}
                  onChange={(e) => {
                    const selectedId = e.target.value;
                    const selectedGroup = groups.find((g) => g.id === selectedId);
                    onGroupChange(selectedId, selectedGroup?.name);
                    if (selectedGroup) onGroupSearchChange(selectedGroup.name);
                  }}
                  className={`${inputClass} appearance-none cursor-pointer pr-10`}
                  required
                >
                  <option value="" disabled>
                    Выберите группу
                  </option>
                  {[...groups]
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((g) => (
                      <option key={g.id} value={g.id} className={isDark ? "bg-zinc-900" : "bg-white"}>
                        {g.name}
                      </option>
                    ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3">
                  <svg
                    className={`h-4 w-4 transition-transform group-focus-within:rotate-180 ${isDark ? "text-zinc-500" : "text-gray-400"}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth="2.5"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            )}
          </div>

          {groupsNotice ? (
            <p className={`text-xs ${isDark ? "text-amber-400" : "text-amber-700"}`}>{groupsNotice}</p>
          ) : null}
          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={loading || !group}
            className="w-full rounded-xl bg-[#3390ec] py-3 text-sm font-semibold text-white transition hover:bg-[#2d7fd6] disabled:opacity-50"
          >
            {loading ? "Входим…" : "Открыть журнал"}
          </button>
        </div>
      </form>

      {loginHistory.length > 0 ? (
        <div className={`mt-6 w-full max-w-md overflow-hidden rounded-2xl border ${isDark ? "border-zinc-800 bg-zinc-900" : "border-gray-200 bg-white"}`}>
          <div className={`border-b px-4 py-2.5 text-xs font-medium uppercase tracking-wide ${isDark ? "border-zinc-800 text-zinc-400" : "border-gray-100 text-gray-400"}`}>
            Недавние входы
          </div>
          <ul className="max-h-48 overflow-y-auto">
            {loginHistory.map((item) => (
              <li
                key={item.id}
                className={`flex items-center justify-between border-b px-4 py-2.5 last:border-b-0 ${
                  isDark ? "border-zinc-800" : "border-gray-100"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onPickHistory(item)}
                  className={`min-w-0 flex-1 text-left text-sm ${isDark ? "text-zinc-200 hover:text-white" : "text-gray-700 hover:text-gray-900"}`}
                >
                  <span className="font-medium">{item.surname}</span>
                  <span className={`ml-2 text-xs ${isDark ? "text-zinc-500" : "text-gray-400"}`}>
                    {item.groupName}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveHistory(item.id)}
                  className="ml-2 shrink-0 text-xs text-red-500 hover:text-red-600"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
