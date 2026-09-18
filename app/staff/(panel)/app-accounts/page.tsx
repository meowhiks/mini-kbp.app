"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AdminAlert,
  AdminCard,
  AdminPageHeader,
  AdminTableWrap,
  adminBtnDanger,
  adminBtnOutline,
  adminInput,
} from "@/app/components/staff/AdminShell";
import { AdminColumnFilters, AdminTablePager } from "@/app/components/staff/AdminTableTools";
import { AdminTooltip } from "@/app/components/staff/AdminTooltip";
import AppAccountEditModal, { AppAccountAvatar } from "@/app/components/staff/AppAccountEditModal";
import AppAccountPushModal from "@/app/components/staff/AppAccountPushModal";
import { AuthProviderBadge, authProviderFilterLabel } from "@/app/components/staff/AuthProviderBadge";
import { AdminIconEdit, AdminIconBell, AdminIconTrash, StatusDot, adminBtnIcon, adminBtnIconDanger } from "@/app/components/staff/adminIcons";
import { useStaffSession } from "@/app/components/staff/useStaffSession";
import { useAdminTable, type ColumnFilters } from "@/lib/client/adminTable";
import { deleteAppAccount, deleteAppAccounts, fetchAppAccounts, fetchPushHealth, type AppAccountRecord } from "@/lib/client/miniKbpServer";

type SortKey = "label" | "email" | "group_name" | "has_student" | "has_teacher" | "auth_provider" | "is_active";

export default function StaffAppAccountsPage() {
  const { session, loading: authLoading } = useStaffSession(true, true);
  const [rows, setRows] = useState<AppAccountRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"any" | "teacher" | "student">("any");
  const [sortKey, setSortKey] = useState<SortKey>("label");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({});
  const [editAccount, setEditAccount] = useState<AppAccountRecord | null>(null);
  const [pushAccount, setPushAccount] = useState<AppAccountRecord | null>(null);
  const [pushHealth, setPushHealth] = useState<Awaited<ReturnType<typeof fetchPushHealth>>>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    if (!session || session.role !== "admin") return;
    setLoading(true);
    void Promise.all([fetchAppAccounts(session, roleFilter), fetchPushHealth(session)]).then(([data, health]) => {
      setRows(data);
      setPushHealth(health);
      setLoading(false);
    });
  }, [session, roleFilter]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows;
    if (q) {
      list = list.filter(
        (r) =>
          r.label.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          r.display_name.toLowerCase().includes(q) ||
          (r.group_name || "").toLowerCase().includes(q) ||
          (r.nickname || "").toLowerCase().includes(q)
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === "auth_provider") {
        return authProviderFilterLabel(a.auth_provider).localeCompare(authProviderFilterLabel(b.auth_provider), "ru") * dir;
      }
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "boolean" && typeof bv === "boolean") return (av === bv ? 0 : av ? 1 : -1) * dir;
      const as = String(av ?? "");
      const bs = String(bv ?? "");
      return as.localeCompare(bs, "ru") * dir;
    });
  }, [query, rows, sortKey, sortDir]);

  const { paged, page, setPage, pageCount, total } = useAdminTable(filtered, {
    columnFilters,
    matchColumn: (row, col, val) => {
      if (col === "label") {
        return (
          row.label.toLowerCase().includes(val) ||
          (row.nickname || "").toLowerCase().includes(val) ||
          row.display_name.toLowerCase().includes(val)
        );
      }
      if (col === "email") return (row.email || "").toLowerCase().includes(val);
      if (col === "group_name") return (row.group_name || "").toLowerCase().includes(val);
      if (col === "has_student") {
        const label = row.has_student ? "да" : "нет";
        return label.includes(val);
      }
      if (col === "has_teacher") {
        const label = row.has_teacher ? "да" : "нет";
        return label.includes(val);
      }
      if (col === "is_active") {
        const label = row.is_active ? "актив" : "выкл";
        return label.includes(val);
      }
      if (col === "auth_provider") {
        return authProviderFilterLabel(row.auth_provider).includes(val);
      }
      return true;
    },
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortMark = (key: SortKey) => (sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "");

  const copySelected = () => {
    const lines = filtered
      .filter((r) => selected.has(r.id))
      .map((r) => `${r.label}\t${r.email || "—"}\t${r.group_name || "—"}`);
    if (lines.length) {
      void navigator.clipboard?.writeText(lines.join("\n"));
      setSuccess(`Скопировано: ${lines.length}`);
    }
  };

  const removeAccounts = async (ids: number[]) => {
    if (!session || ids.length === 0) return;
    const label = ids.length === 1 ? "этот аккаунт" : `аккаунты (${ids.length})`;
    if (!confirm(`Удалить ${label} безвозвратно?`)) return;
    setDeleteBusy(true);
    setError("");
    const r =
      ids.length === 1 ? await deleteAppAccount(session, ids[0]) : await deleteAppAccounts(session, ids);
    setDeleteBusy(false);
    if (!r.ok) {
      setError(r.detail);
      return;
    }
    const idSet = new Set(ids);
    setRows((prev) => prev.filter((row) => !idSet.has(row.id)));
    setSelected(new Set());
    setSuccess(ids.length === 1 ? "Аккаунт удалён" : `Удалено: ${ids.length}`);
  };

  const toggleAll = () => {
    if (selected.size === paged.length && paged.every((r) => selected.has(r.id))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(paged.map((r) => r.id)));
    }
  };

  if (authLoading || loading) {
    return <div className="text-sm text-gray-500">Загрузка…</div>;
  }

  return (
    <div data-testid="admin-app-accounts-page">
      <AdminPageHeader title="Аккаунты" />

      <AdminAlert error={error} success={success} />

      {pushHealth && !pushHealth.firebase_configured ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Firebase на сервере не настроен — добавьте <code className="text-xs">FIREBASE_SERVICE_ACCOUNT_JSON</code> в env
          API и перезапустите контейнер.
        </div>
      ) : null}
      {pushHealth ? (
        <p className="mb-4 text-xs text-gray-500">
          Push: Firebase {pushHealth.firebase_configured ? "подключён" : "не настроен"} · активных Android-устройств:{" "}
          {pushHealth.devices_active_android} (привязано к аккаунтам: {pushHealth.devices_linked_android})
        </p>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по имени, email, группе…"
          className={`${adminInput} max-w-md`}
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
          className={`${adminInput} w-auto min-w-[180px]`}
        >
          <option value="any">Все аккаунты</option>
          <option value="teacher">Без профиля преподавателя</option>
          <option value="student">Без профиля студента</option>
        </select>
        {selected.size > 0 ? (
          <>
            <button type="button" className={adminBtnOutline} onClick={copySelected}>
              Копировать ({selected.size})
            </button>
            <button
              type="button"
              className={adminBtnDanger}
              disabled={deleteBusy}
              onClick={() => void removeAccounts([...selected])}
            >
              Удалить ({selected.size})
            </button>
          </>
        ) : null}
      </div>

      <AdminCard>
        <AdminTableWrap testId="admin-app-accounts-table">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={paged.length > 0 && paged.every((r) => selected.has(r.id))}
                  onChange={toggleAll}
                />
              </th>
              <th className="px-3 py-2">Аватар</th>
              <th className="cursor-pointer px-3 py-2" onClick={() => toggleSort("label")}>
                Пользователь{sortMark("label")}
              </th>
              <th className="cursor-pointer px-3 py-2" onClick={() => toggleSort("auth_provider")}>
                Вход{sortMark("auth_provider")}
              </th>
              <th className="cursor-pointer px-3 py-2" onClick={() => toggleSort("email")}>
                Email{sortMark("email")}
              </th>
              <th className="cursor-pointer px-3 py-2" onClick={() => toggleSort("group_name")}>
                Группа{sortMark("group_name")}
              </th>
              <th className="cursor-pointer px-3 py-2" onClick={() => toggleSort("is_active")}>
                Статус{sortMark("is_active")}
              </th>
              <th className="cursor-pointer px-3 py-2" onClick={() => toggleSort("has_student")}>
                Студент{sortMark("has_student")}
              </th>
              <th className="cursor-pointer px-3 py-2" onClick={() => toggleSort("has_teacher")}>
                Препод.{sortMark("has_teacher")}
              </th>
              <th className="px-3 py-2">Android</th>
              <th className="px-3 py-2" />
            </tr>
            <AdminColumnFilters
              leadingCols={2}
              columns={[
                { key: "label", label: "Пользователь" },
                { key: "auth_provider", label: "Вход" },
                { key: "email", label: "Email" },
                { key: "group_name", label: "Группа" },
                { key: "is_active", label: "Статус" },
                { key: "has_student", label: "Студент" },
                { key: "has_teacher", label: "Препод." },
                { key: "android", label: "Android" },
              ]}
              filters={columnFilters}
              onChange={setColumnFilters}
            />
          </thead>
          <tbody>
            {total === 0 ? (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-sm text-gray-400">
                  Ничего не найдено
                </td>
              </tr>
            ) : (
              paged.map((row) => (
                <tr key={row.id} className="border-b border-gray-100">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(row.id);
                        else next.delete(row.id);
                        setSelected(next);
                      }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <AppAccountAvatar account={row} size="sm" />
                  </td>
                  <td className="px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-900">{row.label}</p>
                      {row.nickname ? <p className="truncate text-xs text-gray-400">@{row.nickname}</p> : null}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <AuthProviderBadge provider={row.auth_provider} telegramUsername={row.telegram_username} />
                  </td>
                  <td className="px-3 py-2">
                    {row.email ? (
                      <button
                        type="button"
                        className="text-gray-600 hover:underline"
                        onClick={() => {
                          void navigator.clipboard?.writeText(row.email);
                          setSuccess(`Скопирован: ${row.email}`);
                        }}
                      >
                        {row.email}
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {row.group_name ? (
                      <AdminTooltip label={row.group_name}>
                        <span className="block max-w-[8rem] truncate text-gray-600">{row.group_name}</span>
                      </AdminTooltip>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <AdminTooltip label={row.is_active ? "Активен" : "Деактивирован"}>
                      <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                        <StatusDot active={row.is_active} />
                        {row.is_active ? "Активен" : "Выкл."}
                      </span>
                    </AdminTooltip>
                  </td>
                  <td className="px-3 py-2">
                    <AdminTooltip label={row.has_student ? "Профиль студента" : "Нет профиля студента"}>
                      <span>
                        <StatusDot active={row.has_student} />
                      </span>
                    </AdminTooltip>
                  </td>
                  <td className="px-3 py-2">
                    <AdminTooltip label={row.has_teacher ? "Профиль преподавателя" : "Нет профиля преподавателя"}>
                      <span>
                        <StatusDot active={row.has_teacher} />
                      </span>
                    </AdminTooltip>
                  </td>
                  <td className="px-3 py-2">
                    {row.has_android_push ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        Android
                        {row.android_push_count > 1 ? ` · ${row.android_push_count}` : ""}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      {row.has_android_push ? (
                        <AdminTooltip label="Отправить push" side="bottom" align="end">
                          <button
                            type="button"
                            className={adminBtnIcon}
                            aria-label="Отправить push"
                            title="Отправить push"
                            onClick={() => setPushAccount(row)}
                          >
                            <AdminIconBell />
                          </button>
                        </AdminTooltip>
                      ) : null}
                      <AdminTooltip label="Редактировать" side="bottom" align="end">
                      <button
                        type="button"
                        className={adminBtnIcon}
                        aria-label="Редактировать"
                        title="Редактировать"
                        onClick={() => setEditAccount(row)}
                      >
                        <AdminIconEdit />
                      </button>
                    </AdminTooltip>
                    <AdminTooltip label="Удалить" side="bottom" align="end">
                      <button
                        type="button"
                        className={adminBtnIconDanger}
                        aria-label="Удалить"
                        title="Удалить"
                        disabled={deleteBusy}
                        onClick={() => void removeAccounts([row.id])}
                      >
                        <AdminIconTrash />
                      </button>
                    </AdminTooltip>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </AdminTableWrap>
        <AdminTablePager page={page} pageCount={pageCount} total={total} pageSize={25} onPageChange={setPage} />
      </AdminCard>

      {editAccount && session ? (
        <AppAccountEditModal
          account={editAccount}
          session={session}
          onClose={() => setEditAccount(null)}
          onSaved={(updated) => {
            setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
            setSuccess(`Сохранено: ${updated.label}`);
          }}
          onDeleted={(id) => {
            setRows((prev) => prev.filter((r) => r.id !== id));
            setSuccess("Аккаунт удалён");
          }}
        />
      ) : null}

      {pushAccount && session ? (
        <AppAccountPushModal
          account={pushAccount}
          session={session}
          onClose={() => setPushAccount(null)}
          onSent={(msg) => setSuccess(msg)}
        />
      ) : null}
    </div>
  );
}
