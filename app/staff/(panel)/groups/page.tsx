"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AdminAlert,
  AdminCard,
  AdminPageHeader,
  AdminTableWrap,
  adminBtnDanger,
  adminBtnPrimary,
  adminInput,
} from "@/app/components/staff/AdminShell";
import { useStaffSession } from "@/app/components/staff/useStaffSession";
import {
  createGroup,
  deleteGroup,
  fetchGroups,
  updateGroup,
  type GroupRecord,
} from "@/lib/client/miniKbpServer";
import { AdminColumnFilters, AdminTablePager } from "@/app/components/staff/AdminTableTools";
import { useAdminTable, type ColumnFilters } from "@/lib/client/adminTable";
import { createAutosaveScheduler, mergeAdminEditDrafts } from "@/lib/client/adminAutosave";
import { useAdminLiveReload } from "@/lib/client/useAdminLiveReload";

type GroupEdit = { name: string; description: string; is_active: boolean };

function toGroupEdit(g: GroupRecord): GroupEdit {
  return { name: g.name, description: g.description, is_active: g.is_active };
}

export default function StaffGroupsPage() {
  const { session, loading: authLoading } = useStaffSession(true, true);
  const [rows, setRows] = useState<GroupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({});
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [edits, setEdits] = useState<Record<number, GroupEdit>>({});
  const editsRef = useRef(edits);
  editsRef.current = edits;
  const autosave = useRef(createAutosaveScheduler());

  useEffect(() => () => autosave.current.cancel(), []);

  const reload = useCallback(
    async (silent = false) => {
      if (!session) return;
      const list = await fetchGroups(session);
      setRows(list);
      setEdits((prev) => {
        const next = silent
          ? mergeAdminEditDrafts(prev, list, autosave.current.pendingIds, toGroupEdit)
          : Object.fromEntries(list.map((g) => [g.id, toGroupEdit(g)]));
        editsRef.current = next;
        return next;
      });
      for (const g of list) {
        if (!silent || !autosave.current.pendingIds.has(g.id)) {
          autosave.current.markSaved(g.id, toGroupEdit(g));
        }
      }
      if (!silent) setLoading(false);
    },
    [session]
  );

  useEffect(() => {
    if (session?.role !== "admin") return;
    void reload(false);
  }, [session, reload]);

  useAdminLiveReload(session?.role === "admin", () => reload(true));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (g) => g.name.toLowerCase().includes(q) || (g.description || "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  const { paged, page, setPage, pageCount, total } = useAdminTable(filtered, {
    columnFilters,
    matchColumn: (row, col, val) => {
      const edit = edits[row.id];
      if (col === "name") return (edit?.name ?? row.name).toLowerCase().includes(val);
      if (col === "description") return (edit?.description ?? row.description ?? "").toLowerCase().includes(val);
      if (col === "student_count") return String(row.student_count ?? 0).includes(val);
      if (col === "is_active") {
        const active = edit?.is_active ?? row.is_active;
        const label = active ? "да" : "нет";
        return label.includes(val);
      }
      return true;
    },
    sortCompare: (a, b) => a.name.localeCompare(b.name, "ru"),
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setError("");
    setSuccess("");
    const r = await createGroup(session, { name: newName.trim(), description: newDescription.trim() });
    if (!r.ok) {
      setError(r.detail);
      return;
    }
    setNewName("");
    setNewDescription("");
    setShowAdd(false);
    setSuccess("Группа добавлена");
    await reload(false);
  };

  const saveRow = async (id: number) => {
    if (!session) return;
    const edit = editsRef.current[id];
    if (!edit) return;
    setError("");
    const r = await updateGroup(session, id, {
      name: edit.name.trim(),
      description: edit.description.trim(),
      is_active: edit.is_active,
    });
    if (!r.ok) {
      setError(r.detail);
      return;
    }
    setSuccess("Сохранено");
    setRows((prev) =>
      prev.map((row) =>
        row.id === id ? { ...row, name: edit.name.trim(), description: edit.description.trim(), is_active: edit.is_active } : row
      )
    );
  };

  const applyEdit = (id: number, patch: Partial<GroupEdit>, immediate = false) => {
    const cur = editsRef.current[id];
    if (!cur) return;
    const nextEdit = { ...cur, ...patch };
    const next = { ...editsRef.current, [id]: nextEdit };
    editsRef.current = next;
    setEdits(next);
    autosave.current.schedule(
      id,
      nextEdit,
      () => {
        void saveRow(id).finally(() => autosave.current.pendingIds.delete(id));
      },
      immediate ? 0 : undefined
    );
  };

  const handleDelete = async (id: number) => {
    if (!session || !confirm("Удалить группу?")) return;
    setError("");
    setSuccess("");
    const r = await deleteGroup(session, id);
    if (!r.ok) setError(r.detail);
    else {
      setSuccess("Группа удалена");
      await reload(false);
    }
  };

  if (authLoading || loading) {
    return <div className="text-sm text-gray-500">Загрузка…</div>;
  }

  return (
    <div>
      <AdminPageHeader
        title="Группы"
        subtitle="Изменения в таблице сохраняются сами, список обновляется автоматически"
        actions={
          <button type="button" className={adminBtnPrimary} onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? "Скрыть" : "+ Группа"}
          </button>
        }
      />
      <AdminAlert error={error} success={success} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск группы…"
          className={`${adminInput} max-w-md`}
        />
      </div>

      {showAdd ? (
        <AdminCard className="mb-4 p-3">
          <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
            <label className="min-w-[140px] flex-1">
              <span className="mb-1 block text-xs text-gray-500">Название</span>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} required className={adminInput} />
            </label>
            <label className="min-w-[200px] flex-[2]">
              <span className="mb-1 block text-xs text-gray-500">Описание</span>
              <input value={newDescription} onChange={(e) => setNewDescription(e.target.value)} className={adminInput} />
            </label>
            <button type="submit" className={adminBtnPrimary}>Создать</button>
          </form>
        </AdminCard>
      ) : null}

      <AdminCard>
        <AdminTableWrap>
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
              <th className="px-3 py-2">Название</th>
              <th className="px-3 py-2">Описание</th>
              <th className="px-3 py-2">Студентов</th>
              <th className="px-3 py-2">Активна</th>
              <th className="px-3 py-2" />
            </tr>
            <AdminColumnFilters
              columns={[
                { key: "name", label: "Название" },
                { key: "description", label: "Описание" },
                { key: "student_count", label: "Студентов" },
                { key: "is_active", label: "Активна" },
              ]}
              filters={columnFilters}
              onChange={setColumnFilters}
              trailingCols={1}
            />
          </thead>
          <tbody>
            {total === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-gray-500">Группы не найдены</td>
              </tr>
            ) : (
              paged.map((row) => {
                const edit = edits[row.id];
                if (!edit) return null;
                return (
                  <tr key={row.id} className="border-b border-gray-100">
                    <td className="px-3 py-2">
                      <input
                        value={edit.name}
                        onChange={(e) => applyEdit(row.id, { name: e.target.value })}
                        className={adminInput}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={edit.description}
                        onChange={(e) => applyEdit(row.id, { description: e.target.value })}
                        className={adminInput}
                      />
                    </td>
                    <td className="px-3 py-2 text-gray-600">{row.student_count ?? 0}</td>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={edit.is_active}
                        onChange={(e) => applyEdit(row.id, { is_active: e.target.checked }, true)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <button type="button" className={adminBtnDanger} onClick={() => void handleDelete(row.id)}>
                        Удалить
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </AdminTableWrap>
        <AdminTablePager page={page} pageCount={pageCount} total={total} pageSize={25} onPageChange={setPage} />
      </AdminCard>
    </div>
  );
}
