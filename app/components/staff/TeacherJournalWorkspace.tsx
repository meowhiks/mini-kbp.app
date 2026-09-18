"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import AppOfflineBanner from "@/app/components/app/AppOfflineBanner";
import TeacherJournalTable from "@/app/components/staff/TeacherJournalTable";
import TeacherJournalSkeleton from "@/app/components/staff/TeacherJournalSkeleton";
import TeacherStudentProfileModal from "@/app/components/staff/TeacherStudentProfileModal";
import JournalHistoryPanel from "@/app/components/staff/JournalHistoryPanel";
import JournalSyncModal, { type JournalConflict } from "@/app/components/staff/JournalSyncModal";
import {
  JournalLockIconButton,
  JournalScreenLockOverlay,
  JournalScreenLockSetup,
} from "@/app/components/staff/JournalScreenLock";
import { StaffLink } from "@/app/components/staff/StaffLink";
import { useStaffSession } from "@/app/components/staff/useStaffSession";
import type { AppTheme } from "@/lib/client/appTheme";
import { themeIsDark } from "@/lib/client/appTheme";
import {
  parseJournalMenuBackdrop,
  type JournalMenuBackdrop,
} from "@/lib/client/journalMenuBackdrop";
import { storageGet } from "@/lib/client/storage";
import type { StaffSession } from "@/lib/client/miniKbpServer";
import { fetchGroupCurators } from "@/lib/client/miniKbpServer";
import {
  isPinnedGroup,
  loadManualPins,
  loadTodayGroups,
  markTodayGroup,
  saveManualPins,
  sortGroupsForSubject,
  toggleManualPin,
} from "@/lib/client/journalGroupPins";
import {
  emptyLockState,
  loadJournalScreenLock,
  type JournalScreenLockState,
} from "@/lib/client/journalScreenLock";
import { formatStudentShortName } from "@/lib/client/displayNameParts";
import { probeServerReachable } from "@/lib/client/serverReachability";
import { todayBorderRight } from "@/lib/client/journalToday";
import {
  journalHoverCellBg,
  journalHoverClear,
  journalHoverFromCell,
  journalHoverFromColumn,
  type JournalHoverState,
} from "@/lib/client/journalHover";
import { STUDENT_ROW_H, clampJournalScalePercent } from "@/lib/client/journalGridData";
import {
  getDateColWidth,
  getIndexColWidth,
  startColumnResize,
  startDateColumnResize,
  startMonthColumnsResize,
  useJournalColumnWidths,
} from "@/lib/client/journalColumnWidths";
import { useJournalHorizontalWheel } from "@/lib/client/useJournalHorizontalWheel";
import {
  addDateColumn,
  addLessonColumn,
  applyLocalGrade,
  buildTeacherGridFromBundle,
  defaultLabDueDate,
  filterLabOkrTeacherGrid,
  markGradeSaved,
  removeDateColumn,
  isoToday,
  columnKey,
  type TeacherJournalGridData,
} from "@/lib/client/teacherJournalGrid";
import {
  fetchJournalAccess,
  fetchJournalBundle,
  getCachedJournalAccess,
  getCachedJournalBundle,
  filterJournalAccessGroups,
  saveGrade,
  deleteGrade,
  saveJournalDay,
  deleteJournalDay,
  saveLateness,
  normDate,
  type JournalAccessGroup,
  type JournalBundle,
} from "@/lib/client/teacherJournal";
import {
  createCommandId,
  emptyCommandStore,
  pushCommand,
  redoCommand,
  undoCommand,
  type JournalCommandType,
  type JournalCommandStore,
} from "@/lib/client/journalCommands";
import { hydrateCommandStore, saveJournalCommandHistory } from "@/lib/client/journalHistoryStore";
import { enqueueJournalOp, listQueuedJournalOps, removeQueuedJournalOps } from "@/lib/client/journalOpQueue";
import { beginLoading, endLoading } from "@/lib/client/loadingOrchestrator";
import { showSavedToast } from "@/lib/client/savedToast";
import { showErrorDialog } from "@/lib/client/errorDialog";
import { getServerUrl } from "@/lib/client/serverUrl";
import { getLkAppUrl, getLkLoginUrl } from "@/lib/client/lkAppUrl";

type Mode = "journal" | "lateness" | "lab_okr";
type DayType = "normal" | "lab" | "okr";
type UndoEntry = { undo: () => void };

type SubjectNav = {
  id: number;
  name: string;
  byGroup: Map<number, { assignmentId: number; canEdit: boolean }>;
};

function buildSubjectNav(groups: JournalAccessGroup[]): SubjectNav[] {
  const map = new Map<number, SubjectNav>();
  for (const g of groups) {
    for (const a of g.assignments) {
      const sid = a.subject_detail?.id ?? (typeof a.subject === "number" ? a.subject : 0);
      const detail = a.subject_detail;
      const name =
        detail?.short_name?.trim() ||
        detail?.name ||
        (typeof a.subject === "string" ? a.subject : String(a.subject));
      if (!sid) continue;
      if (!map.has(sid)) map.set(sid, { id: sid, name, byGroup: new Map() });
      map.get(sid)!.byGroup.set(g.id, { assignmentId: a.id, canEdit: a.can_edit });
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

function ScrollToolbar({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`app-scroll flex items-center gap-2 overflow-x-auto pb-1 ${className}`}>
      {children}
    </div>
  );
}

function fieldClass(isDark: boolean) {
  return isDark
    ? "rounded-lg border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-100"
    : "rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-800";
}

function modeBtn(active: boolean, isDark: boolean) {
  if (active) return "shrink-0 whitespace-nowrap rounded-lg bg-[#3390ec] px-3 py-1.5 text-sm font-medium text-white";
  return isDark
    ? "shrink-0 whitespace-nowrap rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-200"
    : "shrink-0 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600";
}

function navChip(active: boolean, isDark: boolean) {
  if (active) {
    return "shrink-0 whitespace-nowrap rounded-lg border border-[#3390ec] bg-[#3390ec] px-3 py-1.5 text-sm font-medium text-white";
  }
  return `shrink-0 whitespace-nowrap rounded-lg border px-3 py-1.5 text-sm transition-colors ${
    isDark
      ? "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-600"
      : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
  }`;
}

function IconUndo() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 14H4V9M4 9l5 5M4 9a8 8 0 1 1 2 3.3" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function IconPin({ filled }: { filled?: boolean }) {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M12 17v5M8 3h8l-1 7h3l-6 6-6-6h3L8 3z" />
    </svg>
  );
}

type TeacherJournalWorkspaceProps = {
  variant?: "staff" | "app";
  theme?: AppTheme;
  scalePercent?: number;
  /** Вкладка журнала сейчас на экране — при появлении подтягиваем свежие данные. */
  active?: boolean;
};

export default function TeacherJournalWorkspace({
  variant = "staff",
  theme = "light",
  scalePercent = 100,
  active = true,
}: TeacherJournalWorkspaceProps) {
  const isDark = themeIsDark(theme);
  const inApp = variant === "app";
  const { session, loading: authLoading } = useStaffSession(true);
  const [groups, setGroups] = useState<JournalAccessGroup[]>([]);
  const [groupId, setGroupId] = useState<number | null>(null);
  const [assignmentId, setAssignmentId] = useState<number | null>(null);
  const [bundle, setBundle] = useState<JournalBundle | null>(null);
  const [grid, setGrid] = useState<TeacherJournalGridData | null>(null);
  const [mode, setMode] = useState<Mode>("journal");
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [newDayType, setNewDayType] = useState<DayType>("normal");
  const [newDate, setNewDate] = useState(isoToday());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [columnBusy, setColumnBusy] = useState(false);
  const [serverOffline, setServerOffline] = useState(false);
  const [studentProfile, setStudentProfile] = useState<{ id: number; name: string } | null>(null);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [commandStore, setCommandStore] = useState<JournalCommandStore>(() => emptyCommandStore());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [syncConflicts, setSyncConflicts] = useState<JournalConflict[]>([]);
  const [menuBackdrop, setMenuBackdrop] = useState<JournalMenuBackdrop>("blur");
  const [manualPinIds, setManualPinIds] = useState<Set<number>>(() => new Set());
  const [todayGroupIds, setTodayGroupIds] = useState<Set<number>>(() => new Set());
  const [curatorFallbackIds, setCuratorFallbackIds] = useState<Set<number>>(() => new Set());
  const [lockState, setLockState] = useState<JournalScreenLockState>(() => emptyLockState());
  const [lockSetupOpen, setLockSetupOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await storageGet("app_settings_v1");
        if (!raw || cancelled) return;
        const s = JSON.parse(raw);
        if (!cancelled) setMenuBackdrop(parseJournalMenuBackdrop(s?.journalMenuBackdrop));
      } catch {}
    })();
    const onStorage = (e: StorageEvent) => {
      if (e.key && !e.key.includes("app_settings")) return;
      void (async () => {
        try {
          const raw = await storageGet("app_settings_v1");
          if (!raw) return;
          const s = JSON.parse(raw);
          setMenuBackdrop(parseJournalMenuBackdrop(s?.journalMenuBackdrop));
        } catch {}
      })();
    };
    window.addEventListener("storage", onStorage);
    const onCustom = () => {
      void (async () => {
        try {
          const raw = await storageGet("app_settings_v1");
          if (!raw) return;
          setMenuBackdrop(parseJournalMenuBackdrop(JSON.parse(raw)?.journalMenuBackdrop));
        } catch {}
      })();
    };
    window.addEventListener("minikbp-settings-changed", onCustom);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("minikbp-settings-changed", onCustom);
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    void (async () => {
      const teacherId = session.teacherId ?? null;
      const [pins, today, lock, curators] = await Promise.all([
        loadManualPins(teacherId),
        loadTodayGroups(isoToday()),
        loadJournalScreenLock(teacherId),
        fetchGroupCurators(session).catch(() => []),
      ]);
      if (cancelled) return;
      setManualPinIds(new Set(pins.groupIds));
      setTodayGroupIds(new Set(today.groupIds));
      setLockState(lock);
      setCuratorFallbackIds(
        new Set(
          curators
            .filter((c) => teacherId == null || c.teacher === teacherId)
            .map((c) => c.group)
        )
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (groupId == null || grid?.todayIndex == null) return;
    void markTodayGroup(groupId, isoToday()).then((s) => setTodayGroupIds(new Set(s.groupIds)));
  }, [groupId, grid?.todayIndex]);

  const subjectNav = useMemo(() => buildSubjectNav(groups), [groups]);

  const curatorIds = useMemo(() => {
    const s = new Set<number>(curatorFallbackIds);
    for (const g of groups) {
      if (g.is_curator) s.add(g.id);
    }
    return s;
  }, [groups, curatorFallbackIds]);

  const pinMeta = useMemo(
    () => ({ curatorIds, manualIds: manualPinIds, todayIds: todayGroupIds }),
    [curatorIds, manualPinIds, todayGroupIds]
  );

  const selectedSubject = useMemo(
    () => subjectNav.find((s) => s.id === subjectId) ?? null,
    [subjectNav, subjectId]
  );

  const groupsForSubject = useMemo(() => {
    if (!selectedSubject) return [];
    const list = groups.filter((g) => selectedSubject.byGroup.has(g.id));
    return sortGroupsForSubject(list, pinMeta);
  }, [groups, selectedSubject, pinMeta]);

  const selectedGroup = useMemo(
    () => groupsForSubject.find((g) => g.id === groupId) ?? null,
    [groupsForSubject, groupId]
  );

  const selectedAssignment = useMemo(
    () => selectedGroup?.assignments.find((a) => a.id === assignmentId) ?? null,
    [selectedGroup, assignmentId]
  );

  const canEdit = Boolean(bundle?.can_edit);

  const loadBundle = useCallback(async (s: StaffSession, aid: number) => {
    setError("");
    const cached = await getCachedJournalBundle(aid);
    if (cached) {
      setBundle(cached);
      setGrid(buildTeacherGridFromBundle(cached.students, cached.grades, cached.days));
      setUndoStack([]);
      setCommandStore(await hydrateCommandStore(aid));
    }

    const result = await fetchJournalBundle(s, aid);
    if (!result) {
      if (!cached) setError("Не удалось загрузить журнал");
      if (!cached || !(await probeServerReachable(true))) setServerOffline(true);
      else setServerOffline(false);
      return;
    }
    setBundle(result.data);
    setGrid(buildTeacherGridFromBundle(result.data.students, result.data.grades, result.data.days));
    setUndoStack([]);
    setCommandStore(await hydrateCommandStore(aid));
    if (result.fromCache) {
      setServerOffline(!(await probeServerReachable(true)));
    } else {
      setServerOffline(false);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    void (async () => {
      const cachedAccess = await getCachedJournalAccess();
      const filteredCached = cachedAccess ? filterJournalAccessGroups(cachedAccess) : null;
      if (filteredCached?.length) {
        setGroups(filteredCached);
        const nav = buildSubjectNav(filteredCached);
        if (nav.length > 0) {
          const firstSubject = nav[0];
          const firstGroupId = [...firstSubject.byGroup.keys()][0];
          const firstAssignment = firstSubject.byGroup.get(firstGroupId);
          setSubjectId(firstSubject.id);
          if (firstGroupId) setGroupId(firstGroupId);
          if (firstAssignment) await loadBundle(session, firstAssignment.assignmentId);
        }
        setLoading(false);
      }

      const access = await fetchJournalAccess(session);
      const filteredAccess = filterJournalAccessGroups(access.data);
      setGroups(filteredAccess);
      const nav = buildSubjectNav(filteredAccess);
      if (nav.length > 0) {
        const currentSubject = nav.find((s) => s.id === subjectId) ?? nav[0];
        const currentGroupId =
          (groupId && currentSubject.byGroup.has(groupId) ? groupId : [...currentSubject.byGroup.keys()][0]) ?? null;
        const aid = currentGroupId ? currentSubject.byGroup.get(currentGroupId)?.assignmentId : undefined;
        setSubjectId(currentSubject.id);
        if (currentGroupId) setGroupId(currentGroupId);
        if (aid) await loadBundle(session, aid);
      }
      if (access.fromCache) {
        setServerOffline(!(await probeServerReachable(true)));
      } else {
        setServerOffline(false);
      }
      setLoading(false);
    })();
  }, [session, loadBundle]);

  const prevActiveRef = useRef(active);
  useEffect(() => {
    const opened = active && !prevActiveRef.current;
    prevActiveRef.current = active;
    if (!opened || !session || !assignmentId) return;
    void loadBundle(session, assignmentId);
  }, [active, session, assignmentId, loadBundle]);

  useEffect(() => {
    if (!session || !assignmentId || serverOffline) return;
    void (async () => {
      const online = await probeServerReachable(true);
      if (!online) return;
      const { syncQueuedJournalOps } = await import("@/lib/client/journalSync");
      const result = await syncQueuedJournalOps(session, assignmentId);
      if (result.conflicts.length > 0) setSyncConflicts(result.conflicts);
      else if (result.applied.length > 0) {
        await removeQueuedJournalOps(result.applied);
        await loadBundle(session, assignmentId);
      }
    })();
  }, [session, assignmentId, serverOffline, loadBundle]);

  const resolveAssignmentId = (sid: number, gid: number) => {
    const subj = subjectNav.find((s) => s.id === sid);
    return subj?.byGroup.get(gid)?.assignmentId ?? null;
  };

  const handleSelectSubject = async (sid: number) => {
    setSubjectId(sid);
    const subj = subjectNav.find((s) => s.id === sid);
    if (!subj || !session) return;
    const firstGroupId = [...subj.byGroup.keys()][0];
    if (!firstGroupId) return;
    setGroupId(firstGroupId);
    const aid = subj.byGroup.get(firstGroupId)?.assignmentId;
    if (aid) await loadBundle(session, aid);
  };

  const handleSelectGroup = async (gid: number) => {
    if (!session || subjectId === null) return;
    setGroupId(gid);
    const aid = resolveAssignmentId(subjectId, gid);
    if (aid) await loadBundle(session, aid);
  };

  const handleTogglePin = (gid: number) => {
    if (curatorIds.has(gid)) return;
    const nextIds = toggleManualPin([...manualPinIds], gid);
    setManualPinIds(new Set(nextIds));
    void saveManualPins({ teacherId: session?.teacherId ?? null, groupIds: nextIds });
  };

  const pushUndo = (undo: () => void) => {
    setUndoStack((s) => [...s, { undo }]);
  };

  const undoStackRef = useRef(undoStack);
  undoStackRef.current = undoStack;

  const handleUndo = () => {
    const stack = undoStackRef.current;
    const last = stack[stack.length - 1];
    if (!last) return;
    last.undo();
    setUndoStack(stack.slice(0, -1));
  };

  useEffect(() => {
    if (!canEdit) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.code === "KeyZ" && !e.shiftKey) {
        const stack = undoStackRef.current;
        if (!stack.length) return;
        e.preventDefault();
        handleUndo();
        return;
      }
      if (e.code === "KeyY" || (e.code === "KeyZ" && e.shiftKey)) {
        if (commandStore.redo.length === 0) return;
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canEdit, commandStore.redo.length]);

  useEffect(() => {
    if (bundle) setAssignmentId(bundle.assignment.id);
  }, [bundle]);

  const applyCommandSnapshot = async (
    snapshot: { studentId?: number; date?: string; slot?: number; value?: string | null; minutes?: number | null },
    command: { type: string; target: { dateIndex?: number } }
  ) => {
    if (!session || !bundle || !grid) return;
    const dateIndex =
      command.target.dateIndex ??
      (snapshot.date != null
        ? grid.columns.findIndex((c) => c.date === snapshot.date && c.slot === (snapshot.slot ?? 0))
        : -1);
    if (dateIndex < 0 || snapshot.studentId == null) return;
    if (command.type === "lateness") {
      await handleLateness(snapshot.studentId, dateIndex, snapshot.minutes ?? 0);
      return;
    }
    const metaGradeId = grid.rows.find((r) => r.id === snapshot.studentId)?.gradesMatrix[dateIndex]?.[0]?.id;
    await handleGrade(snapshot.studentId, dateIndex, snapshot.value ?? "", undefined, { gradeId: metaGradeId });
  };

  const handleRedo = () => {
    const { store, command } = redoCommand(commandStore);
    if (!command) return;
    setCommandStore(store);
    if (assignmentId) void saveJournalCommandHistory(assignmentId, store.history);
    void applyCommandSnapshot(command.after, command);
  };

  const recordCommand = (command: Omit<import("@/lib/client/journalCommands").JournalCommand, "id" | "createdAt" | "status"> & { status?: import("@/lib/client/journalCommands").JournalCommand["status"] }) => {
    const full = {
      ...command,
      id: createCommandId(),
      createdAt: Date.now(),
      status: command.status ?? ("applied" as const),
    };
    setCommandStore((s) => {
      const next = pushCommand(s, full);
      if (full.assignmentId) void saveJournalCommandHistory(full.assignmentId, next.history);
      return next;
    });
    if (full.status === "queued_offline") void enqueueJournalOp(full);
  };

  const handleGrade = async (
    studentId: number,
    dateIndex: number,
    value: string,
    _undoFn?: () => void,
    meta?: { gradeId?: number }
  ) => {
    if (!session || !bundle || !canEdit || !grid) return false;
    const col = grid.columns[dateIndex];
    if (!col) return false;
    const iso = col.date;
    const slot = col.slot;
    const prevRow = grid.rows.find((r) => r.id === studentId);
    const prevValue = prevRow?.gradesMatrix[dateIndex]?.[0]?.value ?? null;
    const prevGrid = JSON.parse(JSON.stringify(grid)) as TeacherJournalGridData;
    pushUndo(() => setGrid(prevGrid));
    const trimmed = value.trim();
    const lower = trimmed.toLowerCase();
    const isAbsentMark = lower === "н" || lower === "н.";
    const saveValue =
      lower === "н" && grid.redAbsent[dateIndex] ? "н." : trimmed;
    const clearRedAbsent = Boolean(grid.redAbsent[dateIndex]) && !isAbsentMark && saveValue !== "н.";
    const gradeId = meta?.gradeId ?? prevRow?.gradesMatrix[dateIndex]?.[0]?.id;
    setGrid(applyLocalGrade(grid, studentId, dateIndex, saveValue, { id: gradeId, clearRedAbsent }));
    const commandType: JournalCommandType = saveValue ? "grade_set" : "grade_delete";
    const commandBody = {
      type: commandType,
      assignmentId: bundle.assignment.id,
      actorUserId: session.teacherId,
      target: { studentId, date: iso, slot, dateIndex },
      before: { studentId, date: iso, slot, value: prevValue },
      after: { studentId, date: iso, slot, value: saveValue || null },
    };
    const fail = (detail: string, offline: boolean) => {
      setGrid(prevGrid);
      showErrorDialog(detail || "Не удалось сохранить оценку");
      setError(detail);
      if (offline) {
        recordCommand({ ...commandBody, status: "queued_offline" });
        setServerOffline(true);
      }
    };
    void (async () => {
      try {
        if (!trimmed && gradeId) {
          const r = await deleteGrade(session, gradeId);
          if (!r.ok) {
            fail(r.detail, !serverOffline && !(await probeServerReachable(true)));
            return;
          }
          recordCommand(commandBody);
          showSavedToast();
          return;
        }
        const r = await saveGrade(session, {
          assignment: bundle.assignment.id,
          student: studentId,
          date: iso,
          value: saveValue,
          slot,
          gradeId,
        });
        if (!r.ok) {
          fail(r.detail, !serverOffline && !(await probeServerReachable(true)));
          return;
        }
        const savedId =
          gradeId ??
          (r.data && typeof r.data === "object" && "id" in r.data
            ? (r.data as { id: number }).id
            : undefined);
        await saveJournalDay(session, {
          assignment: bundle.assignment.id,
          date: iso,
          slot,
          day_type: grid.dayTypes[dateIndex] ?? "normal",
          footer_note: grid.footerNotes[dateIndex] ?? "",
          lab_due_date: grid.labDueDates[dateIndex] ?? null,
          lab_credited: grid.labCredited[dateIndex] ?? false,
          red_absent: clearRedAbsent ? false : grid.redAbsent[dateIndex] ?? false,
        });
        setGrid((prev) => (prev ? markGradeSaved(prev, studentId, dateIndex, savedId) : prev));
        recordCommand(commandBody);
        showSavedToast();
      } catch (err) {
        fail(err instanceof Error ? err.message : "Сеть недоступна", true);
      }
    })();
    return true;
  };

  const findNewColumnIndex = (prev: TeacherJournalGridData, next: TeacherJournalGridData) => {
    const prevKeys = new Set(prev.columns.map(columnKey));
    return next.columns.findIndex((c) => !prevKeys.has(columnKey(c)));
  };

  const handleAddDate = async (iso?: string) => {
    if (!session || !bundle || !canEdit || !grid || columnBusy) return;
    const date = normDate(iso ?? newDate);
    const snapshot = grid;
    const next = addDateColumn(grid, date);
    const colIdx = findNewColumnIndex(grid, next);
    const col = next.columns[colIdx];
    if (!col) return;
    const labDue =
      newDayType === "lab" || newDayType === "okr" ? defaultLabDueDate() : null;
    if (colIdx >= 0) {
      next.dayTypes[colIdx] = newDayType;
      if (labDue) next.labDueDates[colIdx] = labDue;
    }
    setGrid(next);
    setColumnBusy(true);
    const r = await saveJournalDay(session, {
      assignment: bundle.assignment.id,
      date: col.date,
      slot: col.slot,
      day_type: newDayType,
      lab_due_date: labDue,
    });
    setColumnBusy(false);
    if (!r.ok) {
      setGrid(snapshot);
      setError(r.detail);
    }
  };

  const handleAddLesson = async (colIndex: number) => {
    if (!session || !bundle || !canEdit || !grid) return false;
    const snapshot = grid;
    const next = addLessonColumn(grid, colIndex);
    const colIdx = findNewColumnIndex(grid, next);
    const col = next.columns[colIdx];
    if (!col) return false;
    if (colIdx >= 0) next.dayTypes[colIdx] = grid.dayTypes[colIndex] ?? "normal";
    setGrid(next);
    setColumnBusy(true);
    const r = await saveJournalDay(session, {
      assignment: bundle.assignment.id,
      date: col.date,
      slot: col.slot,
      day_type: grid.dayTypes[colIndex] ?? "normal",
    });
    setColumnBusy(false);
    if (!r.ok) {
      setGrid(snapshot);
      setError(r.detail);
      return false;
    }
    return true;
  };

  const handleAddToday = async () => {
    setNewDate(isoToday());
    await handleAddDate(isoToday());
  };

  const handleDeleteDate = async (dateIndex: number) => {
    if (!session || !bundle || !canEdit || !grid) return false;
    const dayId = grid.dayIds[dateIndex];
    if (dayId) await deleteJournalDay(session, dayId);
    setGrid(removeDateColumn(grid, dateIndex));
    return true;
  };

  const handleDayType = async (dateIndex: number, type: "normal" | "lab" | "okr") => {
    if (!session || !bundle || !canEdit || !grid) return false;
    const col = grid.columns[dateIndex];
    if (!col) return false;
    const labDue =
      type === "lab" || type === "okr"
        ? grid.labDueDates[dateIndex] ?? defaultLabDueDate()
        : grid.labDueDates[dateIndex] ?? null;
    const r = await saveJournalDay(session, {
      assignment: bundle.assignment.id,
      date: col.date,
      slot: col.slot,
      day_type: type,
      footer_note: grid.footerNotes[dateIndex] ?? "",
      lab_due_date: labDue,
      lab_credited: grid.labCredited[dateIndex] ?? false,
      red_absent: grid.redAbsent[dateIndex] ?? false,
    });
    if (!r.ok) {
      setError(r.detail);
      return false;
    }
    setGrid((prev) =>
      prev
        ? {
            ...prev,
            dayTypes: { ...prev.dayTypes, [dateIndex]: type },
            labDueDates: { ...prev.labDueDates, [dateIndex]: labDue },
          }
        : prev
    );
    return true;
  };

  const handleFooterNote = async (dateIndex: number, note: string) => {
    if (!session || !bundle || !canEdit || !grid) return false;
    const col = grid.columns[dateIndex];
    if (!col) return false;
    const prevGrid = JSON.parse(JSON.stringify(grid)) as TeacherJournalGridData;
    pushUndo(() => setGrid(prevGrid));
    const r = await saveJournalDay(session, {
      assignment: bundle.assignment.id,
      date: col.date,
      slot: col.slot,
      day_type: grid.dayTypes[dateIndex] ?? "normal",
      footer_note: note,
      red_absent: grid.redAbsent[dateIndex] ?? false,
    });
    if (!r.ok) {
      setError(r.detail);
      return false;
    }
    setGrid((prev) =>
      prev ? { ...prev, footerNotes: { ...prev.footerNotes, [dateIndex]: note } } : prev
    );
    return true;
  };

  const handleLateness = async (studentId: number, dateIndex: number, minutes: number) => {
    if (!session || !bundle || !canEdit || !grid) return;
    const iso = grid.dateKeys[dateIndex];
    const slot = grid.columnSlots[dateIndex] ?? 0;
    const prevLateness = bundle.lateness.map((l) => ({ ...l }));
    pushUndo(() => setBundle((prev) => (prev ? { ...prev, lateness: prevLateness } : prev)));
    const r = await saveLateness(session, {
      group: bundle.assignment.group,
      student: studentId,
      date: iso,
      slot,
      minutes,
    });
    if (!r.ok) setError(r.detail);
    else {
      setBundle((prev) => {
        if (!prev) return prev;
        const lateness = prev.lateness.filter(
          (l) =>
            l.student !== studentId ||
            l.date.slice(0, 10) !== iso ||
            (l.slot ?? 0) !== slot
        );
        if (minutes > 0) {
          lateness.push({
            group: bundle.assignment.group,
            student: studentId,
            date: iso,
            slot,
            minutes,
          });
        }
        return { ...prev, lateness };
      });
    }
  };

  const handleLabDueDate = async (dateIndex: number, dueDate: string | null) => {
    if (!session || !bundle || !canEdit || !grid) return false;
    const col = grid.columns[dateIndex];
    if (!col) return false;
    const r = await saveJournalDay(session, {
      assignment: bundle.assignment.id,
      date: col.date,
      slot: col.slot,
      day_type: grid.dayTypes[dateIndex] ?? "normal",
      footer_note: grid.footerNotes[dateIndex] ?? "",
      lab_due_date: dueDate,
      lab_credited: grid.labCredited[dateIndex] ?? false,
      red_absent: grid.redAbsent[dateIndex] ?? false,
    });
    if (!r.ok) {
      setError(r.detail);
      return false;
    }
    setGrid((prev) =>
      prev ? { ...prev, labDueDates: { ...prev.labDueDates, [dateIndex]: dueDate } } : prev
    );
    return true;
  };

  const handleLabCredited = async (dateIndex: number, credited: boolean) => {
    if (!session || !bundle || !canEdit || !grid) return false;
    const col = grid.columns[dateIndex];
    if (!col) return false;
    const r = await saveJournalDay(session, {
      assignment: bundle.assignment.id,
      date: col.date,
      slot: col.slot,
      day_type: grid.dayTypes[dateIndex] ?? "normal",
      footer_note: grid.footerNotes[dateIndex] ?? "",
      lab_due_date: grid.labDueDates[dateIndex] ?? null,
      lab_credited: credited,
      red_absent: grid.redAbsent[dateIndex] ?? false,
    });
    if (!r.ok) {
      setError(r.detail);
      return false;
    }
    setGrid((prev) =>
      prev ? { ...prev, labCredited: { ...prev.labCredited, [dateIndex]: credited } } : prev
    );
    return true;
  };

  const handleRedAbsent = async (dateIndex: number, redAbsent: boolean) => {
    if (!session || !bundle || !canEdit || !grid) return false;
    const col = grid.columns[dateIndex];
    if (!col) return false;
    const r = await saveJournalDay(session, {
      assignment: bundle.assignment.id,
      date: col.date,
      slot: col.slot,
      day_type: grid.dayTypes[dateIndex] ?? "normal",
      footer_note: grid.footerNotes[dateIndex] ?? "",
      lab_due_date: grid.labDueDates[dateIndex] ?? null,
      lab_credited: grid.labCredited[dateIndex] ?? false,
      red_absent: redAbsent,
    });
    if (!r.ok) {
      setError(r.detail);
      return false;
    }
    setGrid((prev) =>
      prev ? { ...prev, redAbsent: { ...prev.redAbsent, [dateIndex]: redAbsent } } : prev
    );
    return true;
  };

  const displayGrid = grid && mode === "lab_okr" ? filterLabOkrTeacherGrid(grid) : grid;

  const mapToGridColIndex = useCallback(
    (displayIdx: number): number => {
      if (mode !== "lab_okr" || !grid || !displayGrid || displayGrid === grid) return displayIdx;
      const col = displayGrid.columns[displayIdx];
      if (!col) return displayIdx;
      const origIdx = grid.columns.findIndex((c) => columnKey(c) === columnKey(col));
      return origIdx >= 0 ? origIdx : displayIdx;
    },
    [grid, displayGrid, mode]
  );

  const hasLabOkr =
    grid &&
    Object.values(grid.dayTypes).some((t) => t === "lab" || t === "okr");

  if ((authLoading || loading) && !grid) {
    return <TeacherJournalSkeleton theme={theme} />;
  }

  const isTeacher = session?.role === "teacher";
  const isAdmin = session?.role === "admin";
  const journalLocked = lockState.locked;
  const labelMuted = isDark ? "text-zinc-500" : "text-gray-400";

  const historyToolbar = canEdit ? (
    <ScrollToolbar className="mt-3 min-w-0">
      <button
        type="button"
        disabled={undoStack.length === 0 || journalLocked}
        onClick={handleUndo}
        className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-2 py-1 text-xs disabled:opacity-40 ${
          isDark
            ? "border-zinc-600 text-zinc-300 hover:bg-zinc-800"
            : "border-gray-200 text-gray-600 hover:bg-gray-50"
        }`}
        title="Ctrl+Z"
      >
        <IconUndo />
        Отменить
      </button>
      <button
        type="button"
        disabled={commandStore.redo.length === 0 || journalLocked}
        onClick={handleRedo}
        className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-2 py-1 text-xs disabled:opacity-40 ${
          isDark
            ? "border-zinc-600 text-zinc-300 hover:bg-zinc-800"
            : "border-gray-200 text-gray-600 hover:bg-gray-50"
        }`}
        title="Ctrl+Y"
      >
        Повторить
      </button>
      <button
        type="button"
        disabled={journalLocked}
        onClick={() => setHistoryOpen(true)}
        className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-2 py-1 text-xs disabled:opacity-40 ${
          isDark
            ? "border-zinc-600 text-zinc-300 hover:bg-zinc-800"
            : "border-gray-200 text-gray-600 hover:bg-gray-50"
        }`}
      >
        История
      </button>
    </ScrollToolbar>
  ) : null;

  const journalBody = (
    <div className={`relative min-w-0 ${journalLocked ? "min-h-[360px]" : ""}`}>
      <AppOfflineBanner
        theme={theme}
        visible={serverOffline}
        message="Журнал преподавателя офлайн — только просмотр сохранённых данных"
      />
      {error ? (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      ) : null}

      <div className="mb-2 flex items-start justify-end px-1">
        <JournalLockIconButton
          isDark={isDark}
          locked={journalLocked}
          onClick={() => {
            if (!journalLocked) setLockSetupOpen(true);
          }}
        />
      </div>

      {groups.length === 0 ? (
        <p className={`text-sm ${isDark ? "text-zinc-400" : "text-gray-500"}`}>Нет данных журнала</p>
      ) : (
        <>
          <div className="mb-3 min-w-0">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-x-3 sm:gap-y-2 pl-1 md:pl-4">
              <div className="min-w-0 w-full space-y-2 sm:w-auto">
                {subjectNav.length > 0 ? (
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`w-16 shrink-0 text-[11px] font-medium uppercase tracking-wide ${labelMuted}`}>
                      Предметы
                    </span>
                    <ScrollToolbar className="min-w-0 flex-1">
                      {subjectNav.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => handleSelectSubject(s.id)}
                          className={navChip(subjectId === s.id, isDark)}
                        >
                          {s.name}
                        </button>
                      ))}
                    </ScrollToolbar>
                  </div>
                ) : null}

                {groupsForSubject.length > 0 ? (
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`w-16 shrink-0 text-[11px] font-medium uppercase tracking-wide ${labelMuted}`}>
                      Группы
                    </span>
                    <ScrollToolbar className="min-w-0 flex-1">
                      {groupsForSubject.map((g) => {
                        const curator = curatorIds.has(g.id);
                        const pinned = isPinnedGroup(g.id, pinMeta);
                        const isToday = todayGroupIds.has(g.id);
                        return (
                          <div
                            key={g.id}
                            className={`inline-flex shrink-0 items-center gap-0.5 ${navChip(groupId === g.id, isDark)} !px-1.5`}
                          >
                            <button
                              type="button"
                              title={curator ? "Кураторская группа" : pinned ? "Открепить" : "Закрепить"}
                              disabled={curator}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTogglePin(g.id);
                              }}
                              className={`flex h-6 w-6 items-center justify-center rounded-md disabled:opacity-100 ${
                                groupId === g.id
                                  ? "text-white/90"
                                  : pinned
                                    ? "text-[#3390ec]"
                                    : isDark
                                      ? "text-zinc-500"
                                      : "text-gray-400"
                              }`}
                            >
                              <IconPin filled={pinned || curator} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSelectGroup(g.id)}
                              className="flex items-center gap-1 px-1.5 py-0.5"
                            >
                              <span>{g.name}</span>
                              {isToday ? (
                                <span
                                  className={`rounded px-1 py-px text-[9px] font-semibold uppercase tracking-wide ${
                                    groupId === g.id
                                      ? "bg-white/20 text-white"
                                      : isDark
                                        ? "bg-[#3390ec]/20 text-[#6eb6f7]"
                                        : "bg-[#3390ec]/12 text-[#3390ec]"
                                  }`}
                                >
                                  сегодня
                                </span>
                              ) : null}
                            </button>
                          </div>
                        );
                      })}
                    </ScrollToolbar>
                  </div>
                ) : null}
              </div>

              {canEdit && mode === "journal" && !journalLocked ? (
                <ScrollToolbar className="w-full sm:w-auto sm:justify-end">
                  <select
                    value={newDayType}
                    onChange={(e) => setNewDayType(e.target.value as DayType)}
                    className={`${fieldClass(isDark)} shrink-0`}
                  >
                    <option value="normal">Обычный</option>
                    <option value="lab">Лаб. работа</option>
                    <option value="okr">ОКР</option>
                  </select>
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className={`${fieldClass(isDark)} shrink-0`}
                  />
                  <button
                    type="button"
                    title="Добавить дату"
                    disabled={columnBusy}
                    onClick={() => handleAddDate()}
                    className={`flex h-8 shrink-0 items-center gap-1 whitespace-nowrap px-2.5 text-xs disabled:opacity-50 ${
                      isDark
                        ? "rounded-lg border border-zinc-600 bg-zinc-800 text-zinc-200 hover:border-[#3390ec]/50"
                        : "rounded-lg border border-gray-200 bg-white text-gray-700 hover:border-[#3390ec]/40 hover:text-[#3390ec]"
                    }`}
                  >
                    <IconCalendar />
                    {columnBusy ? "Сохраняем…" : "Добавить"}
                  </button>
                  <button
                    type="button"
                    title="Добавить сегодня"
                    disabled={columnBusy}
                    onClick={handleAddToday}
                    className={`flex h-8 shrink-0 items-center gap-1 whitespace-nowrap px-2.5 text-xs ${
                      isDark
                        ? "rounded-lg border border-zinc-600 bg-zinc-800 text-zinc-300 hover:border-[#3390ec]/50"
                        : "rounded-lg border border-gray-200 bg-white text-gray-500 hover:border-[#3390ec]/40 hover:text-[#3390ec]"
                    }`}
                  >
                    <IconCalendar />
                    Сегодня
                  </button>
                </ScrollToolbar>
              ) : null}
            </div>
          </div>

          <div
            className={`relative min-w-0 p-2 ${grid && loading ? "pointer-events-none opacity-70" : ""}`}
            aria-busy={Boolean(grid && loading)}
          >
            <ScrollToolbar className="mb-3 min-w-0">
              {!canEdit ? (
                <span className={`shrink-0 text-xs ${isDark ? "text-amber-400" : "text-amber-600"}`}>
                  Только просмотр
                </span>
              ) : null}
              {selectedAssignment && !selectedAssignment.can_edit && canEdit === false ? (
                <span className={`shrink-0 whitespace-nowrap text-xs ${isDark ? "text-zinc-500" : "text-gray-400"}`}>
                  {selectedGroup?.name} · {selectedAssignment.subject_detail?.name ?? selectedAssignment.subject}
                </span>
              ) : null}
              {hasLabOkr ? (
                <button type="button" onClick={() => setMode("lab_okr")} className={modeBtn(mode === "lab_okr", isDark)}>
                  Лаб. / ОКР
                </button>
              ) : null}
              <button type="button" onClick={() => setMode("journal")} className={modeBtn(mode === "journal", isDark)}>
                Журнал
              </button>
              <button type="button" onClick={() => setMode("lateness")} className={modeBtn(mode === "lateness", isDark)}>
                Опоздания
              </button>
            </ScrollToolbar>

            {(mode === "journal" || mode === "lab_okr") && displayGrid ? (
              <>
                <TeacherJournalTable
                  data={displayGrid}
                  readOnly={!canEdit || journalLocked}
                  embedded
                  hideAddColumn
                  labOkrOnly={mode === "lab_okr"}
                  isDark={isDark}
                  scalePercent={scalePercent}
                  menuBackdrop={menuBackdrop}
                  onGrade={(studentId, displayIdx, value, undoFn, meta) =>
                    handleGrade(studentId, mapToGridColIndex(displayIdx), value, undoFn, meta)
                  }
                  onAddToday={handleAddToday}
                  columnBusy={columnBusy}
                  onAddLesson={(displayIdx) => handleAddLesson(mapToGridColIndex(displayIdx))}
                  onDeleteDate={(displayIdx) => handleDeleteDate(mapToGridColIndex(displayIdx))}
                  onDayType={(displayIdx, type) => handleDayType(mapToGridColIndex(displayIdx), type)}
                  onFooterNote={(displayIdx, note) => handleFooterNote(mapToGridColIndex(displayIdx), note)}
                  onLabDueDate={(displayIdx, dueDate) =>
                    handleLabDueDate(mapToGridColIndex(displayIdx), dueDate)
                  }
                  onLabCredited={(displayIdx, credited) =>
                    handleLabCredited(mapToGridColIndex(displayIdx), credited)
                  }
                  onRedAbsent={(displayIdx, redAbsent) =>
                    handleRedAbsent(mapToGridColIndex(displayIdx), redAbsent)
                  }
                  onUndo={handleUndo}
                  canUndo={undoStack.length > 0 && !journalLocked}
                  onStudentClick={(id, name) => setStudentProfile({ id, name })}
                />
                {!journalLocked ? historyToolbar : null}
              </>
            ) : null}

            {studentProfile && !journalLocked ? (
              <TeacherStudentProfileModal
                studentId={studentProfile.id}
                studentName={studentProfile.name}
                theme={theme}
                liftAboveNav={inApp}
                onClose={() => setStudentProfile(null)}
                onSaved={(fullName) => {
                  setGrid((prev) =>
                    prev
                      ? {
                          ...prev,
                          rows: prev.rows.map((r) =>
                            r.id === studentProfile.id ? { ...r, name: fullName } : r
                          ),
                        }
                      : prev
                  );
                  setStudentProfile((p) => (p ? { ...p, name: fullName } : p));
                }}
              />
            ) : null}

            {grid && mode === "lateness" && bundle ? (
              <>
                <LatenessTable
                  grid={grid}
                  lateness={bundle.lateness}
                  readOnly={!canEdit || journalLocked}
                  embedded
                  isDark={isDark}
                  scalePercent={scalePercent}
                  onSave={handleLateness}
                />
                {!journalLocked ? historyToolbar : null}
              </>
            ) : null}

            {!grid ? (
              <div className="flex min-h-[320px] items-center justify-center text-sm text-gray-400">
                Выберите предмет и группу
              </div>
            ) : null}
          </div>
        </>
      )}

      {journalLocked ? (
        <JournalScreenLockOverlay
          state={lockState}
          isDark={isDark}
          teacherId={session?.teacherId}
          liftAboveNav={inApp}
          onUnlocked={setLockState}
        />
      ) : null}

      <JournalScreenLockSetup
        open={lockSetupOpen}
        isDark={isDark}
        teacherId={session?.teacherId}
        liftAboveNav={inApp}
        onClose={() => setLockSetupOpen(false)}
        onLocked={setLockState}
      />

      {historyOpen && !journalLocked ? (
        <JournalHistoryPanel
          items={commandStore.history}
          isAdmin={isAdmin}
          currentUserId={session?.teacherId}
          isDark={isDark}
          liftAboveNav={inApp}
          onUndo={(cmd) => {
            const { store, command } = undoCommand(commandStore);
            if (command?.id === cmd.id) {
              setCommandStore(store);
              if (assignmentId) void saveJournalCommandHistory(assignmentId, store.history);
              void applyCommandSnapshot(command.before, command);
            }
          }}
          onClose={() => setHistoryOpen(false)}
        />
      ) : null}

      {syncConflicts.length > 0 ? (
        <JournalSyncModal
          conflicts={syncConflicts}
          onClose={() => setSyncConflicts([])}
          onResolve={async (choices) => {
            if (!session || !assignmentId) return;
            const { resolveJournalConflicts } = await import("@/lib/client/journalSync");
            const result = await resolveJournalConflicts(session, choices, syncConflicts, assignmentId);
            if (result.conflicts?.length) setSyncConflicts(result.conflicts);
            else {
              setSyncConflicts([]);
              await removeQueuedJournalOps(Object.keys(choices));
              await loadBundle(session, assignmentId);
            }
          }}
        />
      ) : null}
    </div>
  );

  if (isAdmin && !inApp) {
    return <div className="-m-4 flex flex-col md:-m-6">{journalBody}</div>;
  }

  if (inApp) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-hidden">
        <div className={`min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto app-scroll px-2 py-3 ${isDark ? "text-zinc-100" : ""}`}>
        {journalBody}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f8fa]">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">
            {isTeacher ? session?.fullName : `Админ · ${session?.username}`}
          </p>
          <p className="text-xs text-gray-400">Журнал</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {!isTeacher ? (
            <StaffLink href="/staff/groups" className="text-[#3390ec] hover:underline">
              Админка
            </StaffLink>
          ) : null}
          <StaffLink href="/staff/settings" className="text-gray-500 hover:text-gray-800">
            Настройки
          </StaffLink>
          <Link href={getLkAppUrl("/app")} className="text-gray-500 hover:text-gray-800">
            Студентам
          </Link>
          <button
            type="button"
            onClick={async () => {
              const { clearStaffSession } = await import("@/lib/client/miniKbpServer");
              await clearStaffSession();
              window.location.replace(getLkLoginUrl());
            }}
            className="rounded-lg border border-gray-200 px-3 py-1 text-gray-600 hover:bg-gray-50"
          >
            Выйти
          </button>
        </div>
      </header>
      <main className="flex-1 px-2 py-2 sm:px-3">{journalBody}</main>
    </div>
  );
}

const LATE_TOTAL_W = 52;
const LATE_ROW_H = STUDENT_ROW_H;
const LATE_DATE_HEADER_H = 44;
const LATE_MIN_DATE_COL = 40;
const LATE_NAME_MIN = 96;
const LATE_NAME_MAX_MOBILE = 108;

function lateMonthDateRange(monthIdx: number, colspans: number[]) {
  let start = 0;
  for (let i = 0; i < monthIdx; i++) start += colspans[i] ?? 0;
  return { start, count: colspans[monthIdx] ?? 0 };
}

function LateResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      onMouseDown={onMouseDown}
      className="absolute right-0 top-0 z-10 hidden h-full w-1.5 cursor-col-resize hover:bg-[#3390ec]/60 md:block"
      style={{ touchAction: "none" }}
    />
  );
}

function lateCellStyle(bg: string, w: number, h: number = LATE_ROW_H) {
  return {
    width: w,
    height: h,
    minWidth: w,
    maxWidth: w,
    minHeight: h,
    maxHeight: h,
    boxSizing: "border-box" as const,
    backgroundColor: bg,
  };
}

function LatenessTable({
  grid,
  lateness,
  readOnly,
  embedded = false,
  isDark = false,
  scalePercent = 100,
  onSave,
}: {
  grid: TeacherJournalGridData;
  lateness: { student: number; date: string; slot?: number; minutes: number }[];
  readOnly: boolean;
  embedded?: boolean;
  isDark?: boolean;
  scalePercent?: number;
  onSave: (studentId: number, dateIndex: number, minutes: number) => void;
}) {
  const scale = clampJournalScalePercent(scalePercent);
  const cellBg = "var(--app-journal-cell)";
  const headerBg = "var(--app-journal-header)";
  const headerBg2 = "var(--app-journal-month)";
  const rowBg = "var(--app-journal-sticky)";
  const { widths, setWidth, setDateColWidth } = useJournalColumnWidths();
  const lateScrollRef = useJournalHorizontalWheel<HTMLDivElement>();
  const INDEX_COL = getIndexColWidth(widths);
  const TOTAL_COL = LATE_TOTAL_W;

  const [compactNames, setCompactNames] = useState(false);
  const [hover, setHover] = useState<JournalHoverState>(journalHoverClear);
  const map = new Map<string, number>();
  for (const l of lateness) {
    const slot = l.slot ?? 0;
    map.set(`${l.student}:${l.date.slice(0, 10)}:${slot}`, l.minutes);
  }

  const [picker, setPicker] = useState<{ row: number; col: number; anchor?: DOMRect } | null>(null);
  const [localSaved, setLocalSaved] = useState<Set<string>>(new Set());

  const dateColKeys = useMemo(() => grid.columns.map((c) => columnKey(c)), [grid.columns]);
  const dateColWidths = useMemo(
    () => dateColKeys.map((k) => Math.max(LATE_MIN_DATE_COL, getDateColWidth(widths, k))),
    [dateColKeys, widths]
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const apply = () => setCompactNames(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const todayBorder = (idx: number) => todayBorderRight(idx, grid.todayIndex);

  const latenessKey = (studentId: number, dateIndex: number) => {
    const iso = grid.dateKeys[dateIndex];
    const slot = grid.columnSlots[dateIndex] ?? 0;
    return `${studentId}:${iso}:${slot}`;
  };

  const cellSaved = (studentId: number, dateIndex: number) =>
    localSaved.has(latenessKey(studentId, dateIndex));

  const rowTotal = (studentId: number) => {
    let sum = 0;
    for (let di = 0; di < grid.dateKeys.length; di++) {
      sum += map.get(latenessKey(studentId, di)) ?? 0;
    }
    return sum;
  };

  const nameColWidth = useMemo(() => {
    if (!grid.rows.length) return LATE_NAME_MIN;
    const labels = grid.rows.map((r) => (compactNames ? formatStudentShortName(r.name) : r.name));
    const longest = labels.reduce((a, b) => (a.length >= b.length ? a : b), "");
    const est = Math.min(compactNames ? LATE_NAME_MAX_MOBILE : 220, Math.max(LATE_NAME_MIN, longest.length * 7 + 16));
    return Math.max(widths.subjectCol, est);
  }, [grid.rows, compactNames, widths.subjectCol]);

  const tableWidth =
    INDEX_COL +
    nameColWidth +
    dateColWidths.reduce((a, b) => a + b, 0) +
    TOTAL_COL;

  const hoverBg = (base: string, rowIdx: number | null, colIdx: number) =>
    journalHoverCellBg(base, rowIdx, colIdx, hover.hoverRow, hover.hoverCol);

  const markBaseBg = (rowIdx: number, colIdx: number, saved: boolean) => {
    const base = saved ? "var(--app-journal-saved)" : cellBg;
    return hoverBg(base, rowIdx, colIdx);
  };

  const pickMinutes = (studentId: number, dateIndex: number, minutes: number) => {
    const key = latenessKey(studentId, dateIndex);
    setLocalSaved((s) => {
      const next = new Set(s);
      if (minutes > 0) next.add(key);
      else next.delete(key);
      return next;
    });
    onSave(studentId, dateIndex, minutes);
    setPicker(null);
  };

  return (
    <div className={`relative ${isDark ? "text-zinc-100" : ""}`}>
      <div
        ref={lateScrollRef}
        className={`journal-grid-shell app-scroll w-full min-w-0 overflow-x-auto ${embedded ? "" : "rounded-lg border"}`}
        style={scale !== 100 ? ({ zoom: scale / 100 } as CSSProperties) : undefined}
      >
        <table
          className="border-collapse border text-xs"
          cellSpacing={0}
          cellPadding={0}
          style={{ tableLayout: "fixed", width: tableWidth }}
          onMouseLeave={() => setHover(journalHoverClear)}
        >
          <colgroup>
            <col style={{ width: INDEX_COL }} />
            <col style={{ width: nameColWidth }} />
            {dateColWidths.map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
            <col style={{ width: TOTAL_COL }} />
          </colgroup>
          <thead>
            <tr className="border-b" style={{ backgroundColor: headerBg }}>
              <th
                rowSpan={2}
                className="journal-grid-header-text relative sticky left-0 z-20 border-r p-0 text-center text-[13px] font-semibold"
                style={lateCellStyle(headerBg, INDEX_COL)}
                onMouseEnter={() => setHover(journalHoverClear)}
              >
                №
                <LateResizeHandle onMouseDown={(e) => startColumnResize(e, "indexCol", INDEX_COL, setWidth)} />
              </th>
              <th
                rowSpan={2}
                className="journal-grid-header-text relative sticky z-20 border-r px-2 py-0 text-left text-[14px] font-semibold leading-tight"
                style={{
                  left: INDEX_COL,
                  width: nameColWidth,
                  minWidth: nameColWidth,
                  maxWidth: nameColWidth,
                  height: LATE_ROW_H,
                  backgroundColor: headerBg,
                }}
                onMouseEnter={() => setHover(journalHoverClear)}
              >
                Студент
                <LateResizeHandle
                  onMouseDown={(e) => startColumnResize(e, "subjectCol", nameColWidth, setWidth)}
                />
              </th>
              {grid.months.map((month, i) => {
                const { start, count } = lateMonthDateRange(i, grid.monthColspans);
                const monthKeys = Array.from({ length: count }, (_, j) => dateColKeys[start + j] ?? `idx:${start + j}`);
                const monthWidths = Array.from(
                  { length: count },
                  (_, j) => dateColWidths[start + j] ?? widths.markCol
                );
                return (
                  <th
                    key={`${month}-${i}`}
                    colSpan={grid.monthColspans[i]}
                    className="journal-grid-header-text relative border-r px-1 py-1 text-center text-[13px] font-semibold"
                    style={{ backgroundColor: headerBg2 }}
                  >
                    {month}
                    <LateResizeHandle
                      onMouseDown={(e) => startMonthColumnsResize(e, monthKeys, monthWidths, setDateColWidth)}
                    />
                  </th>
                );
              })}
              <th
                rowSpan={2}
                className="journal-grid-header-text relative border-l p-0 text-center text-[11px] font-semibold leading-tight"
                style={{ width: TOTAL_COL, minWidth: TOTAL_COL, maxWidth: TOTAL_COL, height: LATE_ROW_H, backgroundColor: headerBg }}
                onMouseEnter={() => setHover(journalHoverClear)}
              >
                Всего
                <LateResizeHandle onMouseDown={(e) => startColumnResize(e, "avgCol", TOTAL_COL, setWidth)} />
              </th>
            </tr>
            <tr className="border-b" style={{ backgroundColor: headerBg2 }}>
              {grid.dates.map((date, idx) => {
                const w = dateColWidths[idx] ?? widths.markCol;
                const colKey = dateColKeys[idx] ?? `idx:${idx}`;
                return (
                  <td
                    key={idx}
                    className={`journal-grid-muted relative border-r p-0 text-center align-middle text-[13px] font-medium ${todayBorder(idx)}`}
                    style={lateCellStyle(hoverBg(headerBg, null, idx), w, LATE_DATE_HEADER_H)}
                    onMouseEnter={() => setHover(journalHoverFromColumn(idx))}
                  >
                    {date}
                    <LateResizeHandle
                      onMouseDown={(e) => startDateColumnResize(e, colKey, w, setDateColWidth)}
                    />
                  </td>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row, idx) => {
              const total = rowTotal(row.id);
              return (
                <tr key={row.id} className="border-b" style={{ height: LATE_ROW_H }}>
                  <td
                    className="journal-grid-muted sticky left-0 z-10 border-r p-0 text-center align-middle text-[13px] transition-colors"
                    style={lateCellStyle(hoverBg(rowBg, idx, -1), INDEX_COL)}
                    onMouseEnter={() => setHover(journalHoverFromCell(idx, -1))}
                  >
                    {idx + 1}
                  </td>
                  <td
                    className="journal-grid-header-text sticky z-10 border-r px-2 py-0 text-[14px] font-semibold leading-tight whitespace-nowrap overflow-hidden text-ellipsis transition-colors"
                    style={{
                      left: INDEX_COL,
                      width: nameColWidth,
                      minWidth: nameColWidth,
                      maxWidth: nameColWidth,
                      height: LATE_ROW_H,
                      backgroundColor: hoverBg(rowBg, idx, -1),
                    }}
                    title={row.name}
                    onMouseEnter={() => setHover(journalHoverFromCell(idx, -1))}
                  >
                    {compactNames ? formatStudentShortName(row.name) : row.name}
                  </td>
                  {grid.dateKeys.map((_iso, di) => {
                    const mins = map.get(latenessKey(row.id, di)) ?? 0;
                    const saved = cellSaved(row.id, di);
                    const w = dateColWidths[di] ?? widths.markCol;
                    return (
                      <td
                        key={di}
                        className={`relative border-r p-0 text-center align-middle leading-none transition-colors ${todayBorder(di)} ${readOnly ? "" : "cursor-pointer"}`}
                        style={lateCellStyle(markBaseBg(idx, di, saved), w)}
                        onMouseEnter={() => setHover(journalHoverFromCell(idx, di))}
                        onClick={(e) => {
                          if (readOnly) return;
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setPicker({ row: idx, col: di, anchor: rect });
                        }}
                      >
                        <span className="text-[13px] font-medium" style={{ color: "var(--app-journal-text)" }}>
                          {mins > 0 ? `${mins}м` : ""}
                        </span>
                      </td>
                    );
                  })}
                  <td
                    className="journal-grid-header-text border-l p-0 text-center align-middle text-[13px] font-bold leading-tight transition-colors"
                    style={lateCellStyle(hoverBg(rowBg, idx, grid.dateKeys.length), TOTAL_COL)}
                    onMouseEnter={() => setHover(journalHoverFromCell(idx, grid.dateKeys.length))}
                  >
                    {total > 0 ? `${total}м` : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {picker !== null ? (
        <MinutesPickerPopover
          anchor={picker.anchor}
          current={map.get(latenessKey(grid.rows[picker.row]?.id ?? 0, picker.col)) ?? 0}
          onPick={(m) => {
            const row = grid.rows[picker.row];
            if (row) pickMinutes(row.id, picker.col, m);
          }}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </div>
  );
}

function MinutesPickerPopover({
  anchor,
  current,
  onPick,
  onClose,
}: {
  anchor?: DOMRect;
  current: number;
  onPick: (m: number) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  const style: CSSProperties = anchor
    ? {
        position: "fixed",
        top: anchor.bottom + 4,
        left: Math.max(8, anchor.left + anchor.width / 2 - 100),
        zIndex: 101,
      }
    : { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 101 };

  return createPortal(
    <>
      <button type="button" className="fixed inset-0 z-[100] bg-black/20" aria-label="Закрыть" onClick={onClose} />
      <div
        className="w-[200px] rounded-xl border border-gray-200 bg-white p-3 shadow-xl"
        style={style}
      >
        <p className="mb-2 text-center text-xs font-medium text-gray-700">Опоздание 0–25 мин</p>
        <div className="grid max-h-[180px] grid-cols-5 gap-1 overflow-y-auto">
          {Array.from({ length: 26 }, (_, i) => i).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onPick(n)}
              className={`rounded-md py-1 text-sm hover:bg-[#3390ec]/10 hover:text-[#3390ec] ${
                current === n ? "bg-[#3390ec]/15 font-semibold text-[#3390ec]" : ""
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => onPick(0)} className="mt-2 w-full text-xs text-gray-400 hover:text-red-500">
          Очистить
        </button>
      </div>
    </>,
    document.body
  );
}
