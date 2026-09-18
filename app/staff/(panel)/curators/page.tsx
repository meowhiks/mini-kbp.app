"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminAlert,
  AdminCard,
  AdminPageHeader,
  AdminTableWrap,
  adminBtnDanger,
  adminBtnPrimary,
  adminInput,
} from "@/app/components/staff/AdminShell";
import { AdminColumnFilters, AdminTablePager } from "@/app/components/staff/AdminTableTools";
import { StaffLink } from "@/app/components/staff/StaffLink";
import { useStaffSession } from "@/app/components/staff/useStaffSession";
import { useAdminTable, type ColumnFilters } from "@/lib/client/adminTable";
import {
  deleteGroupCurator,
  fetchGroupCurators,
  fetchGroups,
  fetchTeachers,
  type GroupRecord,
  type TeacherRecord,
} from "@/lib/client/miniKbpServer";
import { apiUrl } from "@/lib/client/apiPath";
import { getServerUrl } from "@/lib/client/serverUrl";
import { useAdminLiveReload } from "@/lib/client/useAdminLiveReload";

type CuratorRow = { id: number; teacher: number; group: number };

export default function StaffCuratorsPage() {
  const { session } = useStaffSession(true, true);
  const [teachers, setTeachers] = useState<TeacherRecord[]>([]);
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [teacherId, setTeacherId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [curators, setCurators] = useState<CuratorRow[]>([]);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [search, setSearch] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({});

  const reloadCurators = useCallback(async () => {
    if (!session) return;
    setCurators(await fetchGroupCurators(session));
  }, [session]);

  useEffect(() => {
    if (!session) return;
    void fetchTeachers(session).then(setTeachers);
    void fetchGroups(session).then(setGroups);
    void reloadCurators();
  }, [session, reloadCurators]);

  useAdminLiveReload(Boolean(session), () => {
    void reloadCurators();
    if (!session) return;
    void fetchTeachers(session).then(setTeachers);
    void fetchGroups(session).then(setGroups);
  });

  const teacherName = (id: number) => teachers.find((t) => t.id === id)?.full_name || `#${id}`;
  const groupName = (id: number) => groups.find((g) => g.id === id)?.name || `#${id}`;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return curators;
    return curators.filter(
      (c) => teacherName(c.teacher).toLowerCase().includes(q) || groupName(c.group).toLowerCase().includes(q)
    );
  }, [curators, search, teachers, groups]);

  const { paged, page, setPage, pageCount, total } = useAdminTable(filtered, {
    columnFilters,
    matchColumn: (row, col, val) => {
      if (col === "teacher") return teacherName(row.teacher).toLowerCase().includes(val);
      if (col === "group") return groupName(row.group).toLowerCase().includes(val);
      return true;
    },
    sortCompare: (a, b) => teacherName(a.teacher).localeCompare(teacherName(b.teacher), "ru"),
  });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !teacherId || !groupId) return;
    setError("");
    setOk("");
    const base = session.serverUrl || getServerUrl();
    const res = await fetch(apiUrl(base, "group-curators/"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access}`,
      },
      body: JSON.stringify({ teacher: Number(teacherId), group: Number(groupId) }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body?.detail ?? "Ошибка");
      return;
    }
    setOk("Куратор назначен");
    setTeacherId("");
    setGroupId("");
    await reloadCurators();
  };

  const handleRemove = async (id: number) => {
    if (!session || !confirm("Снять куратора с группы?")) return;
    setError("");
    const r = await deleteGroupCurator(session, id);
    if (!r.ok) {
      setError(r.detail);
      return;
    }
    await reloadCurators();
  };

  return (
    <div>
      <AdminPageHeader
        title="Кураторы"
        subtitle="Список обновляется автоматически"
        actions={
          <StaffLink href="/staff/invite-codes" className={adminBtnPrimary}>
            Коды входа
          </StaffLink>
        }
      />
      <AdminAlert error={error} success={ok || undefined} />

      <AdminCard className="mb-4 p-4">
        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
          <label className="min-w-[180px] flex-1">
            <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} required className={adminInput}>
              <option value="">Преподаватель…</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-[140px] flex-1">
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} required className={adminInput}>
              <option value="">Группа…</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={adminBtnPrimary}>
            Назначить
          </button>
        </form>
      </AdminCard>

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
              <th className="px-3 py-2">Преподаватель</th>
              <th className="px-3 py-2">Группа</th>
              <th className="px-3 py-2 text-right">Действия</th>
            </tr>
            <AdminColumnFilters
              columns={[
                { key: "teacher", label: "Преподаватель" },
                { key: "group", label: "Группа" },
              ]}
              filters={columnFilters}
              onChange={setColumnFilters}
              trailingCols={1}
            />
          </thead>
          <tbody>
            {total === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-8 text-center text-sm text-gray-400">
                  Кураторы не назначены
                </td>
              </tr>
            ) : (
              paged.map((row) => (
                <tr key={row.id} className="border-b border-gray-100">
                  <td className="px-3 py-2 font-medium text-gray-900">{teacherName(row.teacher)}</td>
                  <td className="px-3 py-2 text-gray-600">{groupName(row.group)}</td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" onClick={() => void handleRemove(row.id)} className={adminBtnDanger}>
                      Снять
                    </button>
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
