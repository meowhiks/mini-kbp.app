"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { AdminTablePager, AdminColumnFilters } from "@/app/components/staff/AdminTableTools";
import { useAdminTable, type ColumnFilters } from "@/lib/client/adminTable";
import {
  createSubject,
  deleteSubject,
  fetchSubjects,
  fetchTeachers,
  updateSubject,
  type SubjectRecord,
  type TeacherRecord,
} from "@/lib/client/miniKbpServer";

import { createAutosaveScheduler, mergeAdminEditDrafts } from "@/lib/client/adminAutosave";
import { useAdminLiveReload } from "@/lib/client/useAdminLiveReload";

type RowEdit = {
  name: string;
  short_name: string;
  description: string;
  is_active: boolean;
  teacherIds: number[];
};

function toSubjectEdit(s: SubjectRecord): RowEdit {
  return {
    name: s.name,
    short_name: s.short_name,
    description: s.description,
    is_active: s.is_active,
    teacherIds: s.teacher_ids ?? [],
  };
}

function TeacherMultiSelect({
  teachers,
  value,
  onChange,
  open,
  onOpenChange,
}: {
  teachers: TeacherRecord[];
  value: number[];
  onChange: (ids: number[]) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0, width: 220, maxHeight: 208 });

  const updatePanelPos = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const width = Math.max(rect.width, 220);
    const gap = 4;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const preferBelow = spaceBelow >= 120 || spaceBelow >= spaceAbove;
    const maxHeight = Math.min(208, preferBelow ? spaceBelow - 8 : spaceAbove - 8);
    const top = preferBelow ? rect.bottom + gap : rect.top - maxHeight - gap;
    setPanelPos({
      top: Math.max(8, top),
      left: Math.min(rect.left, window.innerWidth - width - 8),
      width,
      maxHeight: Math.max(80, maxHeight),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePanelPos();
    const onLayout = () => updatePanelPos();
    window.addEventListener("scroll", onLayout, true);
    window.addEventListener("resize", onLayout);
    return () => {
      window.removeEventListener("scroll", onLayout, true);
      window.removeEventListener("resize", onLayout);
    };
  }, [open, updatePanelPos]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      onOpenChange(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onOpenChange]);

  const label = useMemo(() => {
    if (value.length === 0) return "Выберите…";
    const names = value
      .map((id) => teachers.find((t) => t.id === id)?.full_name)
      .filter(Boolean) as string[];
    if (names.length <= 2) return names.join(", ");
    return `${names.length} выбрано`;
  }, [teachers, value]);

  const toggle = (id: number, checked: boolean) => {
    if (checked) onChange([...value, id]);
    else onChange(value.filter((x) => x !== id));
  };

  const panel =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            className="fixed z-[9999] overflow-y-auto rounded border border-gray-300 bg-white py-1 shadow-lg"
            style={{
              top: panelPos.top,
              left: panelPos.left,
              width: panelPos.width,
              maxHeight: panelPos.maxHeight,
            }}
          >
            {teachers.length === 0 ? (
              <p className="px-2 py-1.5 text-sm text-gray-400">Нет преподавателей</p>
            ) : (
              teachers.map((t) => (
                <label
                  key={t.id}
                  className="flex cursor-pointer items-center gap-2 px-2 py-1.5 hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={value.includes(t.id)}
                    onChange={(e) => toggle(t.id, e.target.checked)}
                  />
                  <span className="text-sm text-gray-800">{t.full_name}</span>
                </label>
              ))
            )}
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={rootRef} className="min-w-[200px]">
      <button
        ref={btnRef}
        type="button"
        onClick={() => onOpenChange(!open)}
        className={`${adminInput} w-full min-w-[200px] cursor-pointer truncate text-left`}
        title={label}
      >
        {label}
      </button>
      {panel}
    </div>
  );
}

export default function StaffSubjectsPage() {
  const { session, loading: authLoading } = useStaffSession(true, true);
  const [rows, setRows] = useState<SubjectRecord[]>([]);
  const [teachers, setTeachers] = useState<TeacherRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({});
  const [showAdd, setShowAdd] = useState(false);
  const [openTeachersFor, setOpenTeachersFor] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [newShort, setNewShort] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [edits, setEdits] = useState<Record<number, RowEdit>>({});
  const editsRef = useRef(edits);
  editsRef.current = edits;
  const autosave = useRef(createAutosaveScheduler());

  useEffect(() => () => autosave.current.cancel(), []);

  const reload = useCallback(
    async (silent = false) => {
      if (!session) return;
      const [subjects, teacherList] = await Promise.all([fetchSubjects(session), fetchTeachers(session)]);
      setRows(subjects);
      setTeachers(teacherList);
      setEdits((prev) => {
        const next = silent
          ? mergeAdminEditDrafts(prev, subjects, autosave.current.pendingIds, toSubjectEdit)
          : Object.fromEntries(subjects.map((s) => [s.id, toSubjectEdit(s)]));
        editsRef.current = next;
        return next;
      });
      for (const s of subjects) {
        if (!silent || !autosave.current.pendingIds.has(s.id)) {
          autosave.current.markSaved(s.id, toSubjectEdit(s));
        }
      }
      if (!silent) {
        setOpenTeachersFor(null);
        setLoading(false);
      }
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
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.short_name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const teacherLabel = (ids: number[]) =>
    ids
      .map((id) => teachers.find((t) => t.id === id)?.full_name ?? "")
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

  const { paged, page, setPage, pageCount, total } = useAdminTable(filtered, {
    columnFilters,
    matchColumn: (row, col, val) => {
      if (col === "name") return row.name.toLowerCase().includes(val);
      if (col === "short_name") return row.short_name.toLowerCase().includes(val);
      if (col === "description") return (row.description || "").toLowerCase().includes(val);
      if (col === "teachers") {
        const edit = edits[row.id];
        return teacherLabel(edit?.teacherIds ?? row.teacher_ids ?? []).includes(val);
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
    const r = await createSubject(session, {
      name: newName.trim(),
      short_name: newShort.trim(),
      description: newDescription.trim(),
    });
    if (!r.ok) {
      setError(r.detail);
      return;
    }
    setNewName("");
    setNewShort("");
    setNewDescription("");
    setShowAdd(false);
    setSuccess("Предмет добавлен");
    await reload(false);
  };

  const saveRow = async (id: number) => {
    if (!session) return;
    const edit = editsRef.current[id];
    if (!edit) return;
    setError("");
    const r = await updateSubject(session, id, {
      name: edit.name.trim(),
      short_name: edit.short_name.trim(),
      description: edit.description.trim(),
      is_active: edit.is_active,
      teacher_ids: edit.teacherIds,
    });
    if (!r.ok) {
      setError(r.detail);
      return;
    }
    setSuccess("Сохранено");
    setRows((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              name: edit.name.trim(),
              short_name: edit.short_name.trim(),
              description: edit.description.trim(),
              is_active: edit.is_active,
              teacher_ids: edit.teacherIds,
            }
          : row
      )
    );
  };

  const applyEdit = (id: number, patch: Partial<RowEdit>, immediate = false) => {
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
    if (!session || !confirm("Удалить предмет?")) return;
    setError("");
    const r = await deleteSubject(session, id);
    if (!r.ok) setError(r.detail);
    else {
      setSuccess("Предмет удалён");
      await reload(false);
    }
  };

  if (authLoading || loading) {
    return <div className="text-sm text-gray-500">Загрузка…</div>;
  }

  return (
    <div>
      <AdminPageHeader
        title="Предметы"
        subtitle="Изменения в таблице сохраняются сами, список обновляется автоматически"
        actions={
          <button type="button" className={adminBtnPrimary} onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? "Скрыть" : "+ Предмет"}
          </button>
        }
      />
      <AdminAlert error={error} success={success} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск предмета…"
          className={`${adminInput} max-w-md`}
        />
      </div>

      {showAdd ? (
        <AdminCard className="mb-4 p-3">
          <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
            <label className="min-w-[160px] flex-[2]">
              <span className="mb-1 block text-xs text-gray-500">Название</span>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} required className={adminInput} />
            </label>
            <label className="min-w-[80px]">
              <span className="mb-1 block text-xs text-gray-500">Кратко</span>
              <input value={newShort} onChange={(e) => setNewShort(e.target.value)} className={adminInput} placeholder="МАТ" />
            </label>
            <label className="min-w-[160px] flex-[2]">
              <span className="mb-1 block text-xs text-gray-500">Описание</span>
              <input value={newDescription} onChange={(e) => setNewDescription(e.target.value)} className={adminInput} />
            </label>
            <button type="submit" className={adminBtnPrimary}>
              Создать
            </button>
          </form>
        </AdminCard>
      ) : null}

      <AdminCard>
        <AdminTableWrap>
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
              <th className="px-3 py-2">Название</th>
              <th className="px-3 py-2">Кратко</th>
              <th className="px-3 py-2">Описание</th>
              <th className="min-w-[220px] px-3 py-2">Преподаватели</th>
              <th className="px-3 py-2">Активен</th>
              <th className="px-3 py-2" />
            </tr>
            <AdminColumnFilters
              columns={[
                { key: "name", label: "Название" },
                { key: "short_name", label: "Кратко" },
                { key: "description", label: "Описание" },
                { key: "teachers", label: "Преподаватели" },
              ]}
              filters={columnFilters}
              onChange={setColumnFilters}
              trailingCols={2}
            />
          </thead>
          <tbody>
            {total === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-gray-500">
                  Предметы не найдены
                </td>
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
                        value={edit.short_name}
                        onChange={(e) => applyEdit(row.id, { short_name: e.target.value })}
                        className={`${adminInput} w-20`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={edit.description}
                        onChange={(e) => applyEdit(row.id, { description: e.target.value })}
                        className={adminInput}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <TeacherMultiSelect
                        teachers={teachers}
                        value={edit.teacherIds}
                        onChange={(teacherIds) => applyEdit(row.id, { teacherIds }, true)}
                        open={openTeachersFor === row.id}
                        onOpenChange={(open) => setOpenTeachersFor(open ? row.id : null)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={edit.is_active}
                        onChange={(e) => applyEdit(row.id, { is_active: e.target.checked }, true)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className={adminBtnDanger} onClick={() => void handleDelete(row.id)}>
                          Удалить
                        </button>
                      </div>
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
