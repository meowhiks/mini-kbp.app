"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { AdminIconTrash, adminBtnIconDanger } from "@/app/components/staff/adminIcons";
import { AdminColumnFilters, AdminTablePager } from "@/app/components/staff/AdminTableTools";
import { AdminCompactSelect, AdminIconBadge, AdminTooltip } from "@/app/components/staff/AdminTooltip";
import { useStaffSession } from "@/app/components/staff/useStaffSession";
import { useAdminTable, type ColumnFilters } from "@/lib/client/adminTable";
import {
  createAssignment,
  deleteAssignment,
  fetchAllAssignments,
  fetchGroups,
  fetchSubjects,
  fetchTeachers,
  updateAssignment,
  type GroupRecord,
  type SubjectRecord,
  type TeacherRecord,
  type TeachingAssignment,
} from "@/lib/client/miniKbpServer";
import { createAutosaveScheduler, mergeAdminEditDrafts } from "@/lib/client/adminAutosave";
import { useAdminLiveReload } from "@/lib/client/useAdminLiveReload";

const LESSON_TYPES = [
  { value: "lecture", label: "Лекция" },
  { value: "practice", label: "Практика" },
  { value: "lab", label: "Лаб." },
  { value: "seminar", label: "Семинар" },
] as const;

const LESSON_LABEL: Record<string, string> = Object.fromEntries(LESSON_TYPES.map((x) => [x.value, x.label]));

function compactLabel(text: string, max = 10): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function teacherOptions(teachers: TeacherRecord[]) {
  return teachers.map((t) => ({
    value: String(t.id),
    label: compactLabel(t.full_name, 10),
    hint: t.full_name,
  }));
}

function groupOptions(groups: GroupRecord[]) {
  return groups.map((g) => ({
    value: String(g.id),
    label: compactLabel(g.name, 8),
    hint: g.name,
  }));
}

function subjectOptions(subjects: SubjectRecord[]) {
  return subjects.map((s) => ({
    value: String(s.id),
    label: s.short_name || compactLabel(s.name, 8),
    hint: s.name,
  }));
}

function LessonTypeIcon({ type }: { type: string }) {
  const label = LESSON_LABEL[type] ?? type;
  const icon =
    type === "lecture" ? (
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path strokeLinecap="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ) : type === "practice" ? (
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    ) : type === "lab" ? (
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 3h6l3 7-6 11H6L3 10l6-7z" />
      </svg>
    ) : (
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    );
  return (
    <AdminIconBadge label={label} tone="blue">
      {icon}
    </AdminIconBadge>
  );
}

type SortKey = "teacher" | "group" | "subject" | "lesson_type" | "semester" | "is_active";
type RowEdit = {
  teacher: string;
  group: string;
  subject: string;
  lesson_type: string;
  semester: string;
  hours_per_week: string;
  is_active: boolean;
};

function toAssignmentEdit(r: TeachingAssignment): RowEdit {
  return {
    teacher: String(r.teacher),
    group: String(r.group),
    subject: String(r.subject),
    lesson_type: r.lesson_type,
    semester: String(r.semester),
    hours_per_week: String(r.hours_per_week),
    is_active: r.is_active,
  };
}

export default function StaffAssignmentsPage() {
  const { session, loading: authLoading } = useStaffSession(true, true);
  const [rows, setRows] = useState<TeachingAssignment[]>([]);
  const [teachers, setTeachers] = useState<TeacherRecord[]>([]);
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [subjects, setSubjects] = useState<SubjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({});
  const [sortKey, setSortKey] = useState<SortKey>("teacher");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [edits, setEdits] = useState<Record<number, RowEdit>>({});
  const editsRef = useRef(edits);
  editsRef.current = edits;
  const autosave = useRef(createAutosaveScheduler());
  const [newRow, setNewRow] = useState({
    teacher: "",
    group: "",
    subject: "",
    lesson_type: "lecture",
    semester: "1",
    hours_per_week: "0",
  });

  useEffect(() => () => autosave.current.cancel(), []);

  const reload = useCallback(
    async (silent = false) => {
      if (!session) return;
      const [a, t, g, s] = await Promise.all([
        fetchAllAssignments(session),
        fetchTeachers(session),
        fetchGroups(session),
        fetchSubjects(session),
      ]);
      setRows(a);
      setTeachers(t);
      setGroups(g);
      setSubjects(s);
      setEdits((prev) => {
        const next = silent
          ? mergeAdminEditDrafts(prev, a, autosave.current.pendingIds, toAssignmentEdit)
          : Object.fromEntries(a.map((r) => [r.id, toAssignmentEdit(r)]));
        editsRef.current = next;
        return next;
      });
      for (const row of a) {
        if (!silent || !autosave.current.pendingIds.has(row.id)) {
          autosave.current.markSaved(row.id, toAssignmentEdit(row));
        }
      }
      if (!silent) {
        setSelected(new Set());
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

  const labelFor = (row: TeachingAssignment, key: SortKey) => {
    if (key === "teacher") return row.teacher_detail?.full_name ?? String(row.teacher);
    if (key === "group") return row.group_detail?.name ?? String(row.group);
    if (key === "subject") return row.subject_detail?.name ?? String(row.subject);
    if (key === "lesson_type") return LESSON_LABEL[row.lesson_type] ?? row.lesson_type;
    if (key === "semester") return String(row.semester);
    return row.is_active ? "1" : "0";
  };

  const { paged, page, setPage, pageCount, total } = useAdminTable(rows, {
    search,
    matchSearch: (r, q) => {
      const hay = [
        r.teacher_detail?.full_name,
        r.group_detail?.name,
        r.subject_detail?.name,
        r.subject_detail?.short_name,
        LESSON_LABEL[r.lesson_type],
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    },
    columnFilters,
    matchColumn: (row, col, val) => {
      if (col === "teacher") return labelFor(row, "teacher").toLowerCase().includes(val);
      if (col === "group") return labelFor(row, "group").toLowerCase().includes(val);
      if (col === "subject") return labelFor(row, "subject").toLowerCase().includes(val);
      if (col === "lesson_type") return labelFor(row, "lesson_type").toLowerCase().includes(val);
      if (col === "semester") return String(row.semester).includes(val);
      if (col === "hours") return String(row.hours_per_week).includes(val);
      if (col === "is_active") {
        const label = row.is_active ? "да" : "нет";
        return label.includes(val);
      }
      return true;
    },
    sortCompare: (a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      return labelFor(a, sortKey).localeCompare(labelFor(b, sortKey), "ru") * dir;
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

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !newRow.teacher || !newRow.group || !newRow.subject) {
      setError("Выберите преподавателя, группу и предмет");
      return;
    }
    setError("");
    setSuccess("");
    const r = await createAssignment(session, {
      teacher: Number(newRow.teacher),
      group: Number(newRow.group),
      subject: Number(newRow.subject),
      lesson_type: newRow.lesson_type,
      semester: parseInt(newRow.semester, 10) || 1,
      hours_per_week: parseInt(newRow.hours_per_week, 10) || 0,
    });
    if (!r.ok) {
      setError(r.detail);
      return;
    }
    setSuccess("Назначение создано");
    setNewRow((prev) => ({ ...prev, teacher: "", group: "", subject: "" }));
    await reload(false);
  };

  const saveRow = async (id: number) => {
    if (!session) return;
    const edit = editsRef.current[id];
    if (!edit) return;
    setError("");
    const r = await updateAssignment(session, id, {
      teacher: Number(edit.teacher),
      group: Number(edit.group),
      subject: Number(edit.subject),
      lesson_type: edit.lesson_type,
      semester: parseInt(edit.semester, 10) || 1,
      hours_per_week: parseInt(edit.hours_per_week, 10) || 0,
      is_active: edit.is_active,
    });
    if (!r.ok) {
      setError(r.detail);
      return;
    }
    setSuccess("Сохранено");
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

  const removeOne = async (id: number) => {
    if (!session) return;
    const r = await deleteAssignment(session, id);
    if (!r.ok) setError(r.detail);
    else await reload(false);
  };

  const removeSelected = async () => {
    if (!session || selected.size === 0) return;
    if (!confirm(`Удалить ${selected.size} назначений?`)) return;
    setError("");
    for (const id of selected) {
      const r = await deleteAssignment(session, id);
      if (!r.ok) {
        setError(r.detail);
        break;
      }
    }
    await reload(false);
  };

  const toggleAll = () => {
    const ids = paged.map((r) => r.id);
    const all = ids.every((id) => selected.has(id));
    const next = new Set(selected);
    if (all) ids.forEach((id) => next.delete(id));
    else ids.forEach((id) => next.add(id));
    setSelected(next);
  };

  if (authLoading || loading || !session) {
    return <div className="text-sm text-gray-500">Загрузка…</div>;
  }

  return (
    <div data-testid="admin-assignments-page">
      <AdminPageHeader
        title="Назначения"
        subtitle="Изменения в таблице сохраняются сами, список обновляется автоматически"
      />

      <AdminAlert error={error} success={success} />

      <AdminCard className="mb-4 p-3">
        <form onSubmit={handleQuickAdd} className="flex flex-wrap items-end gap-2">
          <label>
            <span className="mb-1 block text-xs text-gray-500">Преподаватель</span>
            <AdminCompactSelect
              value={newRow.teacher}
              onChange={(teacher) => setNewRow((p) => ({ ...p, teacher }))}
              options={teacherOptions(teachers)}
              placeholder="—"
            />
          </label>
          <label>
            <span className="mb-1 block text-xs text-gray-500">Группа</span>
            <AdminCompactSelect
              value={newRow.group}
              onChange={(group) => setNewRow((p) => ({ ...p, group }))}
              options={groupOptions(groups)}
              placeholder="—"
            />
          </label>
          <label>
            <span className="mb-1 block text-xs text-gray-500">Предмет</span>
            <AdminCompactSelect
              value={newRow.subject}
              onChange={(subject) => setNewRow((p) => ({ ...p, subject }))}
              options={subjectOptions(subjects)}
              placeholder="—"
            />
          </label>
          <label>
            <span className="mb-1 block text-xs text-gray-500">Тип</span>
            <div className="flex items-center gap-1">
              <LessonTypeIcon type={newRow.lesson_type} />
              <select
                value={newRow.lesson_type}
                onChange={(e) => setNewRow((p) => ({ ...p, lesson_type: e.target.value }))}
                className={`${adminInput} w-10 py-1 text-xs`}
                title={LESSON_LABEL[newRow.lesson_type]}
              >
                {LESSON_TYPES.map((lt) => (
                  <option key={lt.value} value={lt.value}>
                    {lt.label}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <label>
            <span className="mb-1 block text-xs text-gray-500">Сем.</span>
            <AdminTooltip label={`Семестр ${newRow.semester}`}>
              <input
                type="number"
                min={1}
                value={newRow.semester}
                onChange={(e) => setNewRow((p) => ({ ...p, semester: e.target.value }))}
                className={`${adminInput} w-10 py-1 text-center text-xs`}
              />
            </AdminTooltip>
          </label>
          <label>
            <span className="mb-1 block text-xs text-gray-500">Ч/нед</span>
            <AdminTooltip label={`${newRow.hours_per_week} ч/нед`}>
              <input
                type="number"
                min={0}
                value={newRow.hours_per_week}
                onChange={(e) => setNewRow((p) => ({ ...p, hours_per_week: e.target.value }))}
                className={`${adminInput} w-10 py-1 text-center text-xs`}
              />
            </AdminTooltip>
          </label>
          <button type="submit" className={adminBtnPrimary}>
            Добавить
          </button>
        </form>
      </AdminCard>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по преподавателю, группе, предмету…"
          className={`${adminInput} max-w-md`}
        />
        {selected.size > 0 ? (
          <button type="button" className={adminBtnDanger} onClick={() => void removeSelected()}>
            Удалить ({selected.size})
          </button>
        ) : null}
      </div>

      <AdminCard>
        <AdminTableWrap testId="admin-assignments-table">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
              <th className="px-2 py-2">
                <input type="checkbox" checked={paged.length > 0 && paged.every((r) => selected.has(r.id))} onChange={toggleAll} />
              </th>
              <th className="cursor-pointer px-2 py-2" onClick={() => toggleSort("teacher")}>
                Преподаватель{sortMark("teacher")}
              </th>
              <th className="cursor-pointer px-2 py-2" onClick={() => toggleSort("group")}>
                Группа{sortMark("group")}
              </th>
              <th className="cursor-pointer px-2 py-2" onClick={() => toggleSort("subject")}>
                Предмет{sortMark("subject")}
              </th>
              <th className="cursor-pointer px-2 py-2" onClick={() => toggleSort("lesson_type")}>
                Тип{sortMark("lesson_type")}
              </th>
              <th className="cursor-pointer px-2 py-2" onClick={() => toggleSort("semester")}>
                Сем.{sortMark("semester")}
              </th>
              <th className="px-2 py-2">Ч/нед</th>
              <th className="cursor-pointer px-2 py-2" onClick={() => toggleSort("is_active")}>
                Акт.{sortMark("is_active")}
              </th>
              <th className="px-2 py-2" />
            </tr>
            <AdminColumnFilters
              leadingCols={1}
              columns={[
                { key: "teacher", label: "Преподаватель" },
                { key: "group", label: "Группа" },
                { key: "subject", label: "Предмет" },
                { key: "lesson_type", label: "Тип" },
                { key: "semester", label: "Сем." },
                { key: "hours", label: "Ч/нед" },
                { key: "is_active", label: "Акт." },
              ]}
              filters={columnFilters}
              onChange={setColumnFilters}
              trailingCols={1}
            />
          </thead>
          <tbody>
            {total === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-sm text-gray-500">
                  Назначений нет
                </td>
              </tr>
            ) : (
              paged.map((row) => {
                const edit = edits[row.id];
                if (!edit) return null;
                return (
                  <tr key={row.id} className="border-b border-gray-100">
                    <td className="px-2 py-2">
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
                    <td className="px-2 py-2">
                      <AdminCompactSelect
                        value={edit.teacher}
                        onChange={(teacher) => applyEdit(row.id, { teacher }, true)}
                        options={teacherOptions(teachers)}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <AdminCompactSelect
                        value={edit.group}
                        onChange={(group) => applyEdit(row.id, { group }, true)}
                        options={groupOptions(groups)}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <AdminCompactSelect
                        value={edit.subject}
                        onChange={(subject) => applyEdit(row.id, { subject }, true)}
                        options={subjectOptions(subjects)}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1">
                        <LessonTypeIcon type={edit.lesson_type} />
                        <select
                          value={edit.lesson_type}
                          onChange={(e) => applyEdit(row.id, { lesson_type: e.target.value }, true)}
                          className={`${adminInput} w-10 py-1 text-xs`}
                          title={LESSON_LABEL[edit.lesson_type] ?? edit.lesson_type}
                          aria-label={LESSON_LABEL[edit.lesson_type] ?? edit.lesson_type}
                        >
                          {LESSON_TYPES.map((lt) => (
                            <option key={lt.value} value={lt.value}>
                              {lt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <AdminTooltip label={`Семестр ${edit.semester}`}>
                        <input
                          value={edit.semester}
                          onChange={(e) => applyEdit(row.id, { semester: e.target.value })}
                          className={`${adminInput} w-10 py-1 text-center text-xs`}
                          aria-label={`Семестр ${edit.semester}`}
                        />
                      </AdminTooltip>
                    </td>
                    <td className="px-2 py-2">
                      <AdminTooltip label={`${edit.hours_per_week} ч/нед`}>
                        <input
                          value={edit.hours_per_week}
                          onChange={(e) => applyEdit(row.id, { hours_per_week: e.target.value })}
                          className={`${adminInput} w-10 py-1 text-center text-xs`}
                          aria-label={`${edit.hours_per_week} ч/нед`}
                        />
                      </AdminTooltip>
                    </td>
                    <td className="px-2 py-2">
                      <AdminTooltip label={edit.is_active ? "Активно" : "Неактивно"}>
                        <input
                          type="checkbox"
                          checked={edit.is_active}
                          onChange={(e) => applyEdit(row.id, { is_active: e.target.checked }, true)}
                          aria-label={edit.is_active ? "Активно" : "Неактивно"}
                        />
                      </AdminTooltip>
                    </td>
                    <td className="px-2 py-2">
                      <AdminTooltip label="Удалить">
                        <button type="button" className={adminBtnIconDanger} aria-label="Удалить" onClick={() => void removeOne(row.id)}>
                          <AdminIconTrash />
                        </button>
                      </AdminTooltip>
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
