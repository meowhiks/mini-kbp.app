"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { AdminIconTrash, adminBtnIconDanger } from "@/app/components/staff/adminIcons";
import { AdminTooltip } from "@/app/components/staff/AdminTooltip";
import { useStaffSession } from "@/app/components/staff/useStaffSession";
import {
  dateInputToExpiresIso,
  formatRemainingTime,
  isoToDateInput,
  useAdminTable,
  type ColumnFilters,
} from "@/lib/client/adminTable";
import {
  createRoleInviteCode,
  deleteRoleInviteCode,
  fetchGroupCurators,
  fetchGroups,
  fetchKbpCatalogTeachers,
  fetchRoleInviteCodes,
  updateRoleInviteCode,
  type GroupRecord,
  type KbpCatalogTeacher,
  type RoleInviteCodeRecord,
} from "@/lib/client/miniKbpServer";
import { createAutosaveScheduler, mergeAdminEditDrafts } from "@/lib/client/adminAutosave";
import { useAdminLiveReload } from "@/lib/client/useAdminLiveReload";
import { curatorOwnedGroups } from "@/lib/client/curatorOwnedGroups";
import StaffInviteShareModal from "@/app/components/staff/StaffInviteShareModal";

const ROLE_LABELS: Record<string, string> = {
  student: "Студент",
  teacher: "Преподаватель",
};

type SortKey = "code" | "role" | "group_name" | "use_count" | "expires_at" | "created_at";
type RowEdit = {
  max_uses: string;
  expires_date: string;
  group_id: string;
  is_active: boolean;
};

const FILTER_COLS = [
  { key: "code", label: "Код" },
  { key: "role", label: "Роль" },
  { key: "group_name", label: "Группа" },
  { key: "max_uses", label: "Макс." },
  { key: "use_count", label: "Исп." },
  { key: "expires_at", label: "Срок" },
  { key: "remaining", label: "Осталось" },
  { key: "is_active", label: "Акт." },
  { key: "used_by", label: "Кем" },
];

function defaultExpiresDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return isoToDateInput(d.toISOString());
}

function toInviteEdit(r: RoleInviteCodeRecord): RowEdit {
  return {
    max_uses: String(r.max_uses),
    expires_date: isoToDateInput(r.expires_at),
    group_id: r.group_id ?? "",
    is_active: r.is_active && r.use_count < r.max_uses,
  };
}
function copyText(text: string) {
  void navigator.clipboard?.writeText(text);
}

export default function StaffInviteCodesPage() {
  const { session } = useStaffSession(true);
  const curatorOnly = session?.role !== "admin";
  const [rows, setRows] = useState<RoleInviteCodeRecord[]>([]);
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [curatorLinks, setCuratorLinks] = useState<{ teacher: number; group: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({});
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [role, setRole] = useState<"student" | "teacher">("student");
  const [groupId, setGroupId] = useState("");
  const [kbpTeacherId, setKbpTeacherId] = useState("");
  const [kbpTeacherQuery, setKbpTeacherQuery] = useState("");
  const [kbpTeachers, setKbpTeachers] = useState<KbpCatalogTeacher[]>([]);
  const [maxUses, setMaxUses] = useState("1");
  const [count, setCount] = useState("1");
  const [expiresDate, setExpiresDate] = useState(defaultExpiresDate);
  const [shareRow, setShareRow] = useState<RoleInviteCodeRecord | null>(null);
  const [edits, setEdits] = useState<Record<number, RowEdit>>({});
  const editsRef = useRef(edits);
  editsRef.current = edits;
  const autosave = useRef(createAutosaveScheduler());
  const [, tick] = useState(0);

  useEffect(() => () => autosave.current.cancel(), []);

  useEffect(() => {
    const id = setInterval(() => tick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const reload = useCallback(
    async (silent = false) => {
      if (!session) return;
      const [codes, groupList, curatorList] = await Promise.all([
        fetchRoleInviteCodes(session),
        fetchGroups(session),
        fetchGroupCurators(session),
      ]);
      setRows(codes);
      setGroups(groupList);
      setCuratorLinks(curatorList.map((c) => ({ teacher: c.teacher, group: c.group })));
      setEdits((prev) => {
        const next = silent
          ? mergeAdminEditDrafts(prev, codes, autosave.current.pendingIds, toInviteEdit)
          : Object.fromEntries(codes.map((r) => [r.id, toInviteEdit(r)]));
        editsRef.current = next;
        return next;
      });
      for (const row of codes) {
        if (!silent || !autosave.current.pendingIds.has(row.id)) {
          autosave.current.markSaved(row.id, toInviteEdit(row));
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
    void reload(false);
  }, [session, reload]);

  useAdminLiveReload(Boolean(session), () => reload(true));

  const selectableGroups = useMemo(() => {
    if (!curatorOnly) return groups;
    return curatorOwnedGroups(groups, curatorLinks, session?.teacherId);
  }, [curatorOnly, groups, curatorLinks, session?.teacherId]);

  useEffect(() => {
    if (!curatorOnly) return;
    setRole("student");
    if (!groupId && selectableGroups.length === 1) {
      setGroupId(String(selectableGroups[0].id));
    }
  }, [curatorOnly, selectableGroups, groupId]);

  useEffect(() => {
    if (!session || role !== "teacher" || !showAdd) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      void fetchKbpCatalogTeachers(session, kbpTeacherQuery).then((list) => {
        if (!cancelled) setKbpTeachers(list);
      });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [session, role, showAdd, kbpTeacherQuery]);

  const sortCompare = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return (a: RoleInviteCodeRecord, b: RoleInviteCodeRecord) => {
      const av = a[sortKey as keyof RoleInviteCodeRecord];
      const bv = b[sortKey as keyof RoleInviteCodeRecord];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "ru") * dir;
    };
  }, [sortKey, sortDir]);

  const { paged, page, setPage, pageCount, total } = useAdminTable(rows, {
    search,
    matchSearch: (r, q) =>
      r.code.toLowerCase().includes(q) ||
      (ROLE_LABELS[r.role] ?? r.role).toLowerCase().includes(q) ||
      (r.group_name || "").toLowerCase().includes(q) ||
      (r.kbp_teacher_name || "").toLowerCase().includes(q) ||
      (r.used_by_label || "").toLowerCase().includes(q),
    columnFilters,
    matchColumn: (r, col, v) => {
      if (col === "code") return r.code.toLowerCase().includes(v);
      if (col === "role") return (ROLE_LABELS[r.role] ?? r.role).toLowerCase().includes(v);
      if (col === "group_name") return (r.group_name || "—").toLowerCase().includes(v);
      if (col === "max_uses") return String(r.max_uses).includes(v);
      if (col === "use_count") return String(r.use_count).includes(v);
      if (col === "expires_at") return isoToDateInput(r.expires_at).includes(v);
      if (col === "remaining") return formatRemainingTime(r.expires_at).toLowerCase().includes(v);
      if (col === "is_active") {
        const active = r.is_active && r.use_count < r.max_uses;
        return (active ? "да актив" : "нет").includes(v);
      }
      if (col === "used_by") return (r.used_by_label || "—").toLowerCase().includes(v);
      return true;
    },
    sortCompare,
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "code" || key === "group_name" ? "asc" : "desc");
    }
  };

  const sortMark = (key: SortKey) => (sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    if (role === "student" && !groupId) {
      setError("Выберите группу для кода студента");
      return;
    }
    setError("");
    setSuccess("");
    const r = await createRoleInviteCode(session, {
      role,
      group_id: groupId ? Number(groupId) : undefined,
      kbp_teacher_id: role === "teacher" && kbpTeacherId ? Number(kbpTeacherId) : undefined,
      max_uses: Math.max(1, parseInt(maxUses, 10) || 1),
      count: Math.max(1, Math.min(50, parseInt(count, 10) || 1)),
      expires_at: dateInputToExpiresIso(expiresDate),
    });
    if (!r.ok) {
      setError(r.detail);
      return;
    }
    const created = Array.isArray(r.data) ? r.data : [r.data];
    if (created.length === 1) {
      setSuccess(`Создан код: ${created[0].code}`);
      copyText(created[0].code);
      setShareRow(created[0]);
    } else {
      setSuccess(`Создано кодов: ${created.length}`);
      copyText(created.map((c) => c.code).join("\n"));
    }
    setShowAdd(false);
    setKbpTeacherId("");
    setKbpTeacherQuery("");
    await reload(false);
  };

  const quickOne = async () => {
    if (!session) return;
    if (role === "student" && !groupId) {
      setError("Выберите группу");
      return;
    }
    setError("");
    setSuccess("");
    const r = await createRoleInviteCode(session, {
      role,
      group_id: groupId ? Number(groupId) : undefined,
      kbp_teacher_id: role === "teacher" && kbpTeacherId ? Number(kbpTeacherId) : undefined,
      max_uses: 1,
      count: 1,
      expires_at: dateInputToExpiresIso(expiresDate),
    });
    if (!r.ok) {
      setError(r.detail);
      return;
    }
    const code = Array.isArray(r.data) ? r.data[0] : r.data;
    copyText(code.code);
    setSuccess(`+1: ${code.code} (скопирован)`);
    setShareRow(code);
    await reload(false);
  };

  const saveRow = async (id: number) => {
    if (!session) return;
    const row = rows.find((r) => r.id === id);
    const edit = editsRef.current[id];
    if (!edit || !row) return;
    setError("");
    const payload: Parameters<typeof updateRoleInviteCode>[2] = {
      max_uses: Math.max(1, parseInt(edit.max_uses, 10) || 1),
      expires_at: dateInputToExpiresIso(edit.expires_date),
      is_active: edit.is_active,
    };
    if (row.role === "student" && row.use_count === 0 && edit.group_id) {
      payload.group_id = Number(edit.group_id);
    }
    const r = await updateRoleInviteCode(session, id, payload);
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

  const revokeOne = async (id: number) => {
    if (!session) return;
    const r = await deleteRoleInviteCode(session, id);
    if (!r.ok) setError(r.detail);
    else await reload(false);
  };

  const revokeSelected = async () => {
    if (!session || selected.size === 0) return;
    if (!confirm(`Отозвать ${selected.size} код(ов)?`)) return;
    setError("");
    for (const id of selected) {
      const r = await deleteRoleInviteCode(session, id);
      if (!r.ok) {
        setError(r.detail);
        break;
      }
    }
    await reload(false);
  };

  const copySelected = () => {
    const codes = paged.filter((r) => selected.has(r.id)).map((r) => r.code);
    if (codes.length) {
      copyText(codes.join("\n"));
      setSuccess(`Скопировано: ${codes.length}`);
    }
  };

  const toggleAllPage = () => {
    const pageIds = paged.map((r) => r.id);
    const allSelected = pageIds.every((id) => selected.has(id));
    const next = new Set(selected);
    if (allSelected) pageIds.forEach((id) => next.delete(id));
    else pageIds.forEach((id) => next.add(id));
    setSelected(next);
  };

  if (loading) return <div className="text-sm text-gray-500">Загрузка…</div>;

  return (
    <div>
      <AdminPageHeader
        title="Коды входа"
        subtitle={
          curatorOnly
            ? "Ссылка или QR для учеников вашей группы · код на N человек"
            : "Ссылка, QR или код · изменения в таблице сохраняются сами"
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <button type="button" className={adminBtnOutline} onClick={() => void quickOne()}>
              +1 быстро
            </button>
            <button type="button" className={adminBtnPrimary} onClick={() => setShowAdd((v) => !v)}>
              {showAdd ? "Скрыть" : "+ Код"}
            </button>
          </div>
        }
      />
      <AdminAlert error={error} success={success} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Общий поиск…"
          className={`${adminInput} max-w-md`}
        />
        {selected.size > 0 ? (
          <>
            <button type="button" className={adminBtnOutline} onClick={copySelected}>
              Копировать ({selected.size})
            </button>
            <button type="button" className={adminBtnDanger} onClick={() => void revokeSelected()}>
              Удалить ({selected.size})
            </button>
          </>
        ) : null}
      </div>

      {showAdd ? (
        <AdminCard className="mb-4 p-3">
          <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
            <label>
              <span className="mb-1 block text-xs text-gray-500">Роль</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "student" | "teacher")}
                className={adminInput}
                disabled={curatorOnly}
              >
                <option value="student">Студент</option>
                {curatorOnly ? null : <option value="teacher">Преподаватель</option>}
              </select>
            </label>
            {role === "student" ? (
              <label className="min-w-[140px]">
                <span className="mb-1 block text-xs text-gray-500">Группа</span>
                <select value={groupId} onChange={(e) => setGroupId(e.target.value)} required className={adminInput}>
                  <option value="">Выберите…</option>
                  {selectableGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="min-w-[220px]">
                <span className="mb-1 block text-xs text-gray-500">Преподаватель kbp (опц.)</span>
                <input
                  type="search"
                  value={kbpTeacherQuery}
                  onChange={(e) => setKbpTeacherQuery(e.target.value)}
                  placeholder="Поиск…"
                  className={`${adminInput} mb-1`}
                />
                <select
                  value={kbpTeacherId}
                  onChange={(e) => setKbpTeacherId(e.target.value)}
                  className={adminInput}
                >
                  <option value="">Без привязки к kbp</option>
                  {kbpTeachers.map((t) => (
                    <option key={t.id} value={t.id} disabled={t.linked}>
                      {t.name}
                      {t.linked ? " (занят)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              <span className="mb-1 block text-xs text-gray-500">На N человек</span>
              <input type="number" min={1} max={255} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} className={`${adminInput} w-20`} />
            </label>
            <label>
              <span className="mb-1 block text-xs text-gray-500">Кодов</span>
              <input type="number" min={1} max={50} value={count} onChange={(e) => setCount(e.target.value)} className={`${adminInput} w-20`} />
            </label>
            <label>
              <span className="mb-1 block text-xs text-gray-500">Действует до</span>
              <input type="date" value={expiresDate} onChange={(e) => setExpiresDate(e.target.value)} required className={adminInput} />
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
              <th className="px-2 py-2">
                <input
                  type="checkbox"
                  checked={paged.length > 0 && paged.every((r) => selected.has(r.id))}
                  onChange={toggleAllPage}
                />
              </th>
              <th className="cursor-pointer px-2 py-2" onClick={() => toggleSort("code")}>
                Код{sortMark("code")}
              </th>
              <th className="cursor-pointer px-2 py-2" onClick={() => toggleSort("role")}>
                Роль{sortMark("role")}
              </th>
              <th className="cursor-pointer px-2 py-2" onClick={() => toggleSort("group_name")}>
                Группа / kbp{sortMark("group_name")}
              </th>
              <th className="px-2 py-2">Макс.</th>
              <th className="cursor-pointer px-2 py-2" onClick={() => toggleSort("use_count")}>
                Исп.{sortMark("use_count")}
              </th>
              <th className="cursor-pointer px-2 py-2" onClick={() => toggleSort("expires_at")}>
                Срок{sortMark("expires_at")}
              </th>
              <th className="px-2 py-2">Осталось</th>
              <th className="px-2 py-2">Акт.</th>
              <th className="px-2 py-2">Кем</th>
              <th className="px-2 py-2" />
            </tr>
            <tr className="border-b border-gray-100 bg-white">
              <th className="px-2 py-1" />
              {FILTER_COLS.map((col) => (
                <th key={col.key} className="px-2 py-1 font-normal">
                  <input
                    type="search"
                    value={columnFilters[col.key] ?? ""}
                    onChange={(e) => setColumnFilters({ ...columnFilters, [col.key]: e.target.value })}
                    placeholder={col.label}
                    className={`${adminInput} text-xs`}
                  />
                </th>
              ))}
              <th className="px-2 py-1" />
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-3 py-6 text-center text-sm text-gray-500">
                  Коды не найдены
                </td>
              </tr>
            ) : (
              paged.map((row) => {
                const edit = edits[row.id];
                if (!edit) return null;
                const usedUp = row.use_count >= row.max_uses;
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
                      <button type="button" className="font-mono text-sm hover:underline" onClick={() => copyText(row.code)}>
                        {row.code}
                      </button>
                    </td>
                    <td className="px-2 py-2 text-gray-600">{ROLE_LABELS[row.role] ?? row.role}</td>
                    <td className="px-2 py-2">
                      {row.role === "student" && row.use_count === 0 ? (
                        <select
                          value={edit.group_id}
                          onChange={(e) => applyEdit(row.id, { group_id: e.target.value }, true)}
                          className={adminInput}
                        >
                          <option value="">—</option>
                          {selectableGroups.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-gray-600">
                          {row.role === "teacher"
                            ? row.kbp_teacher_name || "—"
                            : row.group_name ?? "—"}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <input
                        value={edit.max_uses}
                        onChange={(e) => applyEdit(row.id, { max_uses: e.target.value })}
                        className={`${adminInput} w-14`}
                      />
                    </td>
                    <td className="px-2 py-2 text-gray-600">
                      {row.use_count}/{row.max_uses}
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="date"
                        value={edit.expires_date}
                        onChange={(e) => applyEdit(row.id, { expires_date: e.target.value }, true)}
                        className={adminInput}
                      />
                    </td>
                    <td className="px-2 py-2 text-xs text-gray-600">{formatRemainingTime(row.expires_at)}</td>
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={edit.is_active && !usedUp}
                        disabled={usedUp}
                        onChange={(e) => applyEdit(row.id, { is_active: e.target.checked }, true)}
                      />
                    </td>
                    <td className="px-2 py-2 text-xs text-gray-500">{row.used_by_label ?? "—"}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1">
                        {!usedUp && edit.is_active ? (
                          <button
                            type="button"
                            className={`${adminBtnOutline} !px-2 !py-1 text-xs`}
                            onClick={() => setShareRow(row)}
                          >
                            QR
                          </button>
                        ) : null}
                        {!usedUp && edit.is_active ? (
                          <AdminTooltip label="Удалить">
                            <button type="button" className={adminBtnIconDanger} aria-label="Удалить" onClick={() => void revokeOne(row.id)}>
                              <AdminIconTrash />
                            </button>
                          </AdminTooltip>
                        ) : null}
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

      {shareRow ? (
        <StaffInviteShareModal
          code={shareRow.code}
          groupName={shareRow.group_name}
          maxUses={shareRow.max_uses}
          onClose={() => setShareRow(null)}
        />
      ) : null}
    </div>
  );
}
