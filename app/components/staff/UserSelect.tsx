"use client";

import { adminInput } from "@/app/components/staff/AdminShell";

export type AppAccountOption = {
  id: number;
  label: string;
  email: string;
  group_name: string | null;
};

type UserSelectProps = {
  value: string;
  onChange: (id: string, account?: AppAccountOption) => void;
  accounts: AppAccountOption[];
  placeholder?: string;
  emptyHint?: string;
};

export function UserSelect({
  value,
  onChange,
  accounts,
  placeholder = "Выберите пользователя…",
  emptyHint = "Нет пользователей — сначала вход на /app",
}: UserSelectProps) {
  if (accounts.length === 0) {
    return <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{emptyHint}</p>;
  }

  return (
    <select
      value={value}
      onChange={(e) => {
        const id = e.target.value;
        const acc = accounts.find((a) => String(a.id) === id);
        onChange(id, acc);
      }}
      required
      className={adminInput}
    >
      <option value="">{placeholder}</option>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.label}
          {a.email ? ` · ${a.email}` : ""}
          {a.group_name ? ` · ${a.group_name}` : ""}
        </option>
      ))}
    </select>
  );
}
