"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminAlert,
  AdminCard,
  AdminPageHeader,
  AdminTableWrap,
  adminBtnDanger,
  adminBtnOutline,
  adminBtnPrimary,
  adminInput,
} from "@/app/components/staff/AdminShell";
import { AdminColumnFilters, AdminTablePager } from "@/app/components/staff/AdminTableTools";
import { StatusDot } from "@/app/components/staff/adminIcons";
import { StaffLink } from "@/app/components/staff/StaffLink";
import { useStaffSession } from "@/app/components/staff/useStaffSession";
import { useAdminTable, type ColumnFilters } from "@/lib/client/adminTable";
import {
  deleteStudent,
  fetchStudents,
  impersonateStudent,
  resetStudentApp,
  updateStudent,
  type StudentRecord,
} from "@/lib/client/miniKbpServer";
import { useAdminLiveReload } from "@/lib/client/useAdminLiveReload";
import { getServerUrl } from "@/lib/client/serverUrl";
import { storageSet } from "@/lib/client/storage";

export default function StaffStudentsPage() {
  const { session } = useStaffSession(true, true);
  const [rows, setRows] = useState<StudentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<StudentRecord | null>(null);
  const [deleteTotp, setDeleteTotp] = useState("");
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({});

  const reload = useCallback(async (silent = false) => {
    if (!session) return;
    setRows(await fetchStudents(session));
    if (!silent) setLoading(false);
  }, [session]);

  useEffect(() => {
    void reload(false);
  }, [session, reload]);

  useAdminLiveReload(Boolean(session), () => reload(true));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.full_name.toLowerCase().includes(q) ||
        r.record_book_number.toLowerCase().includes(q) ||
        (r.email || "").toLowerCase().includes(q)
    );
  }, [rows, query]);

  const { paged, page, setPage, pageCount, total } = useAdminTable(filtered, {
    columnFilters,
    matchColumn: (row, col, val) => {
      if (col === "full_name") return row.full_name.toLowerCase().includes(val);
      if (col === "email") return (row.email || "").toLowerCase().includes(val);
      if (col === "status") {
        const label = row.is_active ? "активен" : "неактивен";
        return label.includes(val);
      }
      return true;
    },
    sortCompare: (a, b) => a.full_name.localeCompare(b.full_name, "ru"),
  });

  const toggleActive = async (row: StudentRecord) => {
    if (!session) return;
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_active: !r.is_active } : r)));
    await updateStudent(session, row.id, { is_active: !row.is_active });
  };

  const handleDelete = async (id: number) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    setError("");
    setDeleteTarget(row);
    setDeleteTotp("");
    setDeleteConfirmName("");
  };

  const confirmDelete = async () => {
    if (!session || !deleteTarget) return;
    setDeleteBusy(true);
    const r = await deleteStudent(session, deleteTarget.id, {
      totp_code: deleteTotp.trim(),
      confirm_name: deleteConfirmName.trim(),
    });
    setDeleteBusy(false);
    if (!r.ok) {
      setError(r.detail);
      return;
    }
    setDeleteTarget(null);
    await reload(false);
  };

  const handleLoginAs = async (row: StudentRecord) => {
    if (!session) return;
    const r = await impersonateStudent(session, row.id);
    if (!r.ok) {
      setError(r.detail);
      return;
    }
    const serverUrl = getServerUrl();
    await storageSet(
      "student_session_v1",
      JSON.stringify({
        access: r.data.access,
        refresh: r.data.refresh,
        studentId: r.data.student_id,
        fullName: r.data.full_name,
        groupId: r.data.group_id,
        groupName: r.data.group_name,
      })
    );
    await storageSet(
      "app_session_v1",
      JSON.stringify({
        access: r.data.access,
        refresh: r.data.refresh,
        studentId: r.data.student_id,
        fullName: r.data.full_name,
        groupId: r.data.group_id,
        groupName: r.data.group_name,
        twoFaEnabled: false,
        serverUrl,
      })
    );
    window.location.href = "/app?page=timetable";
  };

  const handleResetApp = async (row: StudentRecord) => {
    if (!session || !confirm(`Сбросить привязку /app для ${row.full_name}?`)) return;
    const r = await resetStudentApp(session, row.id);
    if (!r.ok) setError(r.detail);
  };

  if (loading) return <div className="text-sm text-gray-500">Загрузка…</div>;

  return (
    <div>
      <AdminPageHeader
        title="Студенты"
        subtitle="Список обновляется автоматически"
        actions={
          <>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск…"
              className={`${adminInput} max-w-xs`}
            />
            <StaffLink href="/staff/invite-codes" className={adminBtnPrimary}>
              Создать код
            </StaffLink>
          </>
        }
      />

      <AdminAlert error={error} />

      <AdminCard className="md:hidden">
        <div className="divide-y divide-gray-100">
          {paged.map((row) => (
            <div key={row.id} className="space-y-3 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-700">
                  {row.full_name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900">{row.full_name}</p>
                  {row.email ? <p className="truncate text-xs text-gray-400">{row.email}</p> : null}
                </div>
                <StatusDot active={row.is_active} />
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => handleLoginAs(row)} className={adminBtnOutline}>
                  Войти
                </button>
                <button type="button" onClick={() => handleResetApp(row)} className={adminBtnOutline}>
                  Сброс
                </button>
                <button type="button" onClick={() => toggleActive(row)} className={adminBtnOutline}>
                  {row.is_active ? "Деакт." : "Актив."}
                </button>
                <button type="button" onClick={() => handleDelete(row.id)} className={adminBtnDanger}>
                  Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
        <AdminTablePager page={page} pageCount={pageCount} total={total} pageSize={25} onPageChange={setPage} />
      </AdminCard>

      <AdminCard className="hidden md:block">
        <AdminTableWrap>
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
              <th className="px-3 py-2">ФИО</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Статус</th>
              <th className="px-3 py-2 text-right">Действия</th>
            </tr>
            <AdminColumnFilters
              columns={[
                { key: "full_name", label: "ФИО" },
                { key: "email", label: "Email" },
                { key: "status", label: "Статус" },
              ]}
              filters={columnFilters}
              onChange={setColumnFilters}
              trailingCols={1}
            />
          </thead>
          <tbody>
            {total === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-sm text-gray-400">
                  Ничего не найдено
                </td>
              </tr>
            ) : (
              paged.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-700">
                        {row.full_name.charAt(0)}
                      </div>
                      <span className="font-medium text-gray-900">{row.full_name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-gray-500">{row.email || "—"}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-2 text-sm">
                      <StatusDot active={row.is_active} />
                      {row.is_active ? "Активен" : "Неактивен"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex flex-wrap justify-end gap-2">
                      <button type="button" onClick={() => handleLoginAs(row)} className={adminBtnOutline}>
                        Войти
                      </button>
                      <button type="button" onClick={() => handleResetApp(row)} className={adminBtnOutline}>
                        Сброс
                      </button>
                      <button type="button" onClick={() => toggleActive(row)} className={adminBtnOutline}>
                        {row.is_active ? "Деактив." : "Актив."}
                      </button>
                      <button type="button" onClick={() => handleDelete(row.id)} className={adminBtnDanger}>
                        Удалить
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </AdminTableWrap>
        <AdminTablePager page={page} pageCount={pageCount} total={total} pageSize={25} onPageChange={setPage} />
      </AdminCard>

      {deleteTarget ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-base font-semibold text-gray-900">Удалить студента</h2>
            <p className="mt-2 text-sm text-gray-600">
              Действие необратимо. Введите полное ФИО <span className="font-medium">{deleteTarget.full_name}</span> и
              код 2FA из аутентификатора.
            </p>
            <label className="mt-4 block">
              <span className="mb-1 block text-xs text-gray-500">ФИО для подтверждения</span>
              <input
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                className={adminInput}
                autoComplete="off"
              />
            </label>
            <label className="mt-3 block">
              <span className="mb-1 block text-xs text-gray-500">Код 2FA</span>
              <input
                value={deleteTotp}
                onChange={(e) => setDeleteTotp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className={adminInput}
                inputMode="numeric"
                maxLength={6}
                autoComplete="one-time-code"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className={adminBtnOutline} onClick={() => setDeleteTarget(null)}>
                Отмена
              </button>
              <button
                type="button"
                className={adminBtnDanger}
                disabled={deleteBusy || deleteTotp.length < 6 || !deleteConfirmName.trim()}
                onClick={() => void confirmDelete()}
              >
                {deleteBusy ? "Удаляем…" : "Удалить"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
