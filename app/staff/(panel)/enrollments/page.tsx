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
import { AdminTablePager } from "@/app/components/staff/AdminTableTools";
import { useStaffSession } from "@/app/components/staff/useStaffSession";
import { useAdminTable, type ColumnFilters } from "@/lib/client/adminTable";
import {
  createEnrollmentsBatch,
  deleteEnrollment,
  fetchEnrollments,
  fetchGroups,
  fetchStudents,
  type EnrollmentRecord,
  type GroupRecord,
  type StudentRecord,
} from "@/lib/client/miniKbpServer";
import { useAdminLiveReload } from "@/lib/client/useAdminLiveReload";

const FILTER_COLS = [
  { key: "name", label: "Студент" },
  { key: "email", label: "Email" },
];

export default function StaffEnrollmentsPage() {
  const { session, loading: authLoading } = useStaffSession(true, true);
  const [enrollments, setEnrollments] = useState<EnrollmentRecord[]>([]);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [groupId, setGroupId] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({});

  const reload = useCallback(
    async (silent = false) => {
      if (!session) return;
      const [e, s, g] = await Promise.all([fetchEnrollments(session), fetchStudents(session), fetchGroups(session)]);
      setEnrollments(e);
      setStudents(s);
      setGroups(g);
      if (!silent) setLoading(false);
    },
    [session]
  );

  useEffect(() => {
    if (session?.role !== "admin") return;
    void reload(false);
  }, [session, reload]);

  useAdminLiveReload(session?.role === "admin", () => reload(true));

  const enrolledInGroup = useMemo(() => {
    const gid = Number(groupId);
    if (!gid) return new Set<number>();
    return new Set(
      enrollments.filter((e) => e.group === gid && e.is_active).map((e) => e.student)
    );
  }, [enrollments, groupId]);

  const availableStudents = useMemo(() => {
    if (!groupId) return [];
    return students.filter((s) => s.is_active && !enrolledInGroup.has(s.id));
  }, [students, groupId, enrolledInGroup]);

  const currentEnrollments = useMemo(() => {
    const gid = Number(groupId);
    if (!gid) return [];
    return enrollments.filter((e) => e.group === gid && e.is_active);
  }, [enrollments, groupId]);

  const { paged, page, setPage, pageCount, total } = useAdminTable(availableStudents, {
    search,
    matchSearch: (s, q) =>
      s.full_name.toLowerCase().includes(q) ||
      s.record_book_number.toLowerCase().includes(q) ||
      (s.email || "").toLowerCase().includes(q),
    columnFilters,
    matchColumn: (s, col, v) => {
      if (col === "name") return s.full_name.toLowerCase().includes(v);
      if (col === "email") return (s.email || "").toLowerCase().includes(v);
      return true;
    },
    sortCompare: (a, b) => a.full_name.localeCompare(b.full_name, "ru"),
  });

  const {
    paged: enrolledPaged,
    page: enrolledPage,
    setPage: setEnrolledPage,
    pageCount: enrolledPageCount,
    total: enrolledTotal,
  } = useAdminTable(currentEnrollments, {
    sortCompare: (a, b) =>
      (a.student_detail?.full_name ?? String(a.student)).localeCompare(
        b.student_detail?.full_name ?? String(b.student),
        "ru"
      ),
  });

  const toggleAll = () => {
    const ids = paged.map((s) => s.id);
    const all = ids.every((id) => selected.has(id));
    const next = new Set(selected);
    if (all) ids.forEach((id) => next.delete(id));
    else ids.forEach((id) => next.add(id));
    setSelected(next);
  };

  const handleBatchEnroll = async () => {
    if (!session || !groupId || selected.size === 0) return;
    setError("");
    setSuccess("");
    const r = await createEnrollmentsBatch(session, Number(groupId), [...selected]);
    if (!r.ok) {
      setError(r.detail);
      return;
    }
    setSuccess(`Зачислено: ${r.data.created}, восстановлено: ${r.data.reactivated}`);
    setSelected(new Set());
    await reload(false);
  };

  const handleDelete = async (id: number) => {
    if (!session || !confirm("Исключить из группы?")) return;
    const r = await deleteEnrollment(session, id);
    if (!r.ok) setError(r.detail);
    else await reload(false);
  };

  if (authLoading || loading) {
    return <div className="text-sm text-gray-500">Загрузка…</div>;
  }

  return (
    <div>
      <AdminPageHeader
        title="Зачисления"
        subtitle="Список обновляется автоматически"
      />

      <AdminAlert error={error} success={success} />

      <AdminCard className="mb-4 p-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[200px]">
            <span className="mb-1 block text-xs text-gray-500">Группа</span>
            <select
              value={groupId}
              onChange={(e) => {
                setGroupId(e.target.value);
                setSelected(new Set());
              }}
              className={adminInput}
            >
              <option value="">Выберите группу…</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          {groupId ? (
            <>
              <button
                type="button"
                className={adminBtnPrimary}
                disabled={selected.size === 0}
                onClick={() => void handleBatchEnroll()}
              >
                Зачислить ({selected.size})
              </button>
            </>
          ) : null}
        </div>
      </AdminCard>

      {!groupId ? null : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск студента…"
              className={`${adminInput} max-w-md`}
            />
          </div>

          <AdminCard className="mb-6">
            <AdminTableWrap>
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
                  <th className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={paged.length > 0 && paged.every((s) => selected.has(s.id))}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="px-3 py-2">Студент</th>
                  <th className="px-3 py-2">Email</th>
                </tr>
                <tr className="border-b border-gray-100 bg-white">
                  <th className="px-3 py-1" />
                  {FILTER_COLS.map((col) => (
                    <th key={col.key} className="px-3 py-1 font-normal">
                      <input
                        type="search"
                        value={columnFilters[col.key] ?? ""}
                        onChange={(e) => setColumnFilters({ ...columnFilters, [col.key]: e.target.value })}
                        placeholder={col.label}
                        className={`${adminInput} text-xs`}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-sm text-gray-500">
                      Все активные студенты уже в группе
                    </td>
                  </tr>
                ) : (
                  paged.map((s) => (
                    <tr key={s.id} className="border-b border-gray-100">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selected.has(s.id)}
                          onChange={(e) => {
                            const next = new Set(selected);
                            if (e.target.checked) next.add(s.id);
                            else next.delete(s.id);
                            setSelected(next);
                          }}
                        />
                      </td>
                      <td className="px-3 py-2">{s.full_name}</td>
                      <td className="px-3 py-2 text-gray-600">{s.email || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </AdminTableWrap>
            <AdminTablePager page={page} pageCount={pageCount} total={total} pageSize={25} onPageChange={setPage} />
          </AdminCard>

          <AdminCard>
            <AdminTableWrap>
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
                  <th className="px-3 py-2">Студент</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {enrolledTotal === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-3 py-6 text-center text-sm text-gray-500">
                      Пока никого
                    </td>
                  </tr>
                ) : (
                  enrolledPaged.map((row) => (
                    <tr key={row.id} className="border-b border-gray-100">
                      <td className="px-3 py-2">{row.student_detail?.full_name ?? row.student}</td>
                      <td className="px-3 py-2 text-right">
                        <button type="button" className={adminBtnDanger} onClick={() => void handleDelete(row.id)}>
                          Исключить
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </AdminTableWrap>
            <AdminTablePager
              page={enrolledPage}
              pageCount={enrolledPageCount}
              total={enrolledTotal}
              pageSize={25}
              onPageChange={setEnrolledPage}
            />
          </AdminCard>
        </>
      )}
    </div>
  );
}
