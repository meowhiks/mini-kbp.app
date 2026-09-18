"use client";

import { useMemo, useState } from "react";
import {
  StaffAlert,
  StaffCard,
  StaffPageHeader,
  staffBtnDanger,
} from "@/app/components/staff/staffUi";
import type { StaffSession } from "@/lib/client/miniKbpServer";
import {
  createAssignment,
  deleteAssignment,
  type GroupRecord,
  type SubjectRecord,
  type TeacherRecord,
  type TeachingAssignment,
} from "@/lib/client/miniKbpServer";

type PendingDrop = { groupId: number } | { subjectId: number };

function dragPayload(type: "group" | "subject", id: number) {
  return JSON.stringify({ type, id });
}

function readDragPayload(raw: string): { type: "group" | "subject"; id: number } | null {
  try {
    const p = JSON.parse(raw) as { type?: string; id?: number };
    if ((p.type === "group" || p.type === "subject") && typeof p.id === "number") {
      return { type: p.type, id: p.id };
    }
  } catch {
    // ignore
  }
  return null;
}

type AssignmentScratchBoardProps = {
  session: StaffSession;
  teachers: TeacherRecord[];
  groups: GroupRecord[];
  subjects: SubjectRecord[];
  rows: TeachingAssignment[];
  onChanged: () => Promise<void>;
  onError: (msg: string) => void;
};

export default function AssignmentScratchBoard({
  session,
  teachers,
  groups,
  subjects,
  rows,
  onChanged,
  onError,
}: AssignmentScratchBoardProps) {
  const [pending, setPending] = useState<Record<number, PendingDrop | undefined>>({});
  const [busyTeacher, setBusyTeacher] = useState<number | null>(null);

  const groupName = (id: number) => groups.find((g) => g.id === id)?.name ?? `#${id}`;
  const subjectName = (id: number) => subjects.find((s) => s.id === id)?.name ?? `#${id}`;

  const byTeacher = useMemo(() => {
    const map = new Map<number, TeachingAssignment[]>();
    for (const t of teachers) map.set(t.id, []);
    for (const row of rows) {
      if (!map.has(row.teacher)) map.set(row.teacher, []);
      map.get(row.teacher)!.push(row);
    }
    return map;
  }, [teachers, rows]);

  const tryCreate = async (teacherId: number, groupId: number, subjectId: number) => {
    const exists = rows.some(
      (r) => r.teacher === teacherId && r.group === groupId && r.subject === subjectId
    );
    if (exists) {
      onError("Такое назначение уже есть");
      return;
    }
    setBusyTeacher(teacherId);
    const r = await createAssignment(session, {
      teacher: teacherId,
      group: groupId,
      subject: subjectId,
      lesson_type: "lecture",
    });
    setBusyTeacher(null);
    if (!r.ok) {
      onError(r.detail);
      return;
    }
    setPending((prev) => ({ ...prev, [teacherId]: undefined }));
    await onChanged();
  };

  const handleDrop = async (teacherId: number, payload: { type: "group" | "subject"; id: number }) => {
    const cur = pending[teacherId];
    if (payload.type === "group") {
      if (cur && "subjectId" in cur) {
        await tryCreate(teacherId, payload.id, cur.subjectId);
        return;
      }
      setPending((prev) => ({ ...prev, [teacherId]: { groupId: payload.id } }));
      return;
    }
    if (cur && "groupId" in cur) {
      await tryCreate(teacherId, cur.groupId, payload.id);
      return;
    }
    setPending((prev) => ({ ...prev, [teacherId]: { subjectId: payload.id } }));
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Удалить назначение?")) return;
    const r = await deleteAssignment(session, id);
    if (!r.ok) onError(r.detail);
    else await onChanged();
  };

  return (
    <div className="space-y-4">
      <StaffCard className="p-4">
        <p className="mb-3 text-sm text-gray-600">
          Перетащите <strong>группу</strong> и <strong>предмет</strong> на карточку преподавателя — назначение
          создастся автоматически. Порядок не важен.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Группы</p>
            <div className="app-scroll flex gap-2 overflow-x-auto pb-1">
              {groups.map((g) => (
                <span
                  key={g.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", dragPayload("group", g.id));
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  className="shrink-0 cursor-grab rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-900 active:cursor-grabbing"
                >
                  {g.name}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Предметы</p>
            <div className="app-scroll flex gap-2 overflow-x-auto pb-1">
              {subjects.map((s) => (
                <span
                  key={s.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", dragPayload("subject", s.id));
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  className="shrink-0 cursor-grab rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-900 active:cursor-grabbing"
                >
                  {s.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </StaffCard>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {teachers.map((teacher) => {
          const assigned = byTeacher.get(teacher.id) ?? [];
          const pend = pending[teacher.id];
          const pendingLabel =
            pend && "groupId" in pend
              ? `Ждём предмет · ${groupName(pend.groupId)}`
              : pend && "subjectId" in pend
                ? `Ждём группу · ${subjectName(pend.subjectId)}`
                : null;

          return (
            <div
              key={teacher.id}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
              }}
              onDrop={(e) => {
                e.preventDefault();
                const payload = readDragPayload(e.dataTransfer.getData("text/plain"));
                if (payload) void handleDrop(teacher.id, payload);
              }}
            >
              <StaffCard
                className={`min-h-[140px] p-4 transition-colors ${
                  busyTeacher === teacher.id ? "opacity-60" : "ring-2 ring-transparent hover:ring-blue-100"
                }`}
              >
              <div className="mb-2 font-semibold text-gray-900">{teacher.full_name}</div>
              {pendingLabel ? (
                <p className="mb-2 rounded-md border border-dashed border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                  {pendingLabel}
                </p>
              ) : null}
              <ul className="space-y-1.5 text-sm">
                {assigned.length === 0 && !pendingLabel ? (
                  <li className="text-gray-400">Перетащите сюда группу и предмет</li>
                ) : null}
                {assigned.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-2 rounded-md bg-gray-50 px-2 py-1.5"
                  >
                    <span className="min-w-0 truncate text-gray-700">
                      {row.group_detail?.name ?? row.group} · {row.subject_detail?.name ?? row.subject}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleDelete(row.id)}
                      className={`${staffBtnDanger} shrink-0 px-2 py-0.5 text-xs`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              </StaffCard>
            </div>
          );
        })}
      </div>
    </div>
  );
}
