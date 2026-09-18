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
  deleteTeacher,
  fetchTeachers,
  updateTeacher,
  type TeacherRecord,
} from "@/lib/client/miniKbpServer";
import { useAdminLiveReload } from "@/lib/client/useAdminLiveReload";

export default function StaffTeachersPage() {
  const { session } = useStaffSession(true, true);
  const [rows, setRows] = useState<TeacherRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({});

  const reload = useCallback(async (silent = false) => {
    if (!session) return;
    setRows(await fetchTeachers(session));
    if (!silent) setLoading(false);
  }, [session]);

  useEffect(() => {
    void reload(false);
  }, [session, reload]);

  useAdminLiveReload(Boolean(session), () => reload(true));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.full_name.toLowerCase().includes(q) || r.username.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const { paged, page, setPage, pageCount, total } = useAdminTable(filtered, {
    columnFilters,
    matchColumn: (row, col, val) => {
      if (col === "full_name") return row.full_name.toLowerCase().includes(val);
      if (col === "username") return row.username.toLowerCase().includes(val);
      if (col === "status") {
        const label = row.is_active ? "активен" : "неактивен";
        return label.includes(val);
      }
      return true;
    },
    sortCompare: (a, b) => a.full_name.localeCompare(b.full_name, "ru"),
  });

  const toggleActive = async (row: TeacherRecord) => {
    if (!session) return;
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_active: !r.is_active } : r)));
    await updateTeacher(session, row.id, { is_active: !row.is_active });
  };

  const handleDelete = async (id: number) => {
    if (!session || !confirm("Удалить преподавателя?")) return;
    const r = await deleteTeacher(session, id);
    if (!r.ok) setError(r.detail);
    else await reload(false);
  };

  if (loading) return <div className="text-sm text-gray-500">Загрузка…</div>;

  return (
    <div>
      <AdminPageHeader
        title="Преподаватели"
        subtitle="Список обновляется автоматически"
        actions={
          <StaffLink href="/staff/invite-codes" className={adminBtnPrimary}>
            Создать код
          </StaffLink>
        }
      />

      <AdminAlert error={error} />

      <div className="mb-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск…"
          className={`${adminInput} max-w-md`}
        />
      </div>

      <AdminCard>
        <AdminTableWrap>
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
              <th className="px-3 py-2">ФИО</th>
              <th className="px-3 py-2">Логин</th>
              <th className="px-3 py-2">Статус</th>
              <th className="px-3 py-2 text-right">Действия</th>
            </tr>
            <AdminColumnFilters
              columns={[
                { key: "full_name", label: "ФИО" },
                { key: "username", label: "Логин" },
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
                  <td className="px-3 py-2 font-medium text-gray-900">{row.full_name}</td>
                  <td className="px-3 py-2 text-gray-600">{row.username}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-2 text-sm">
                      <StatusDot active={row.is_active} />
                      {row.is_active ? "Активен" : "Неактивен"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-2">
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
    </div>
  );
}
