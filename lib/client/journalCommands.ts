export const JOURNAL_UNDO_LIMIT = 100;

export type JournalCommandType =
  | "grade_set"
  | "grade_delete"
  | "day_meta"
  | "lateness"
  | "column_add"
  | "column_delete";

export type CellSnapshot = {
  studentId?: number;
  date?: string;
  slot?: number;
  value?: string | null;
  minutes?: number | null;
  extra?: Record<string, unknown>;
};

export type JournalCommand = {
  id: string;
  type: JournalCommandType;
  assignmentId: number;
  actorUserId?: number;
  target: { studentId?: number; date?: string; slot?: number; dateIndex?: number };
  before: CellSnapshot;
  after: CellSnapshot;
  status: "pending" | "applied" | "failed" | "queued_offline" | "undone";
  undoneAt?: number;
  createdAt: number;
};

export function createCommandId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `op_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export type JournalCommandStore = {
  undo: JournalCommand[];
  redo: JournalCommand[];
  history: JournalCommand[];
};

export function emptyCommandStore(): JournalCommandStore {
  return { undo: [], redo: [], history: [] };
}

export function pushCommand(store: JournalCommandStore, command: JournalCommand): JournalCommandStore {
  const undo = [...store.undo, command].slice(-JOURNAL_UNDO_LIMIT);
  const history = [...store.history, command];
  return { undo, redo: [], history };
}

export function undoCommand(store: JournalCommandStore): {
  store: JournalCommandStore;
  command: JournalCommand | null;
} {
  if (store.undo.length === 0) return { store, command: null };
  const command = { ...store.undo[store.undo.length - 1], status: "undone" as const, undoneAt: Date.now() };
  return {
    command,
    store: {
      undo: store.undo.slice(0, -1),
      redo: [...store.redo, command],
      history: store.history.map((item) => (item.id === command.id ? command : item)),
    },
  };
}

export function redoCommand(store: JournalCommandStore): {
  store: JournalCommandStore;
  command: JournalCommand | null;
} {
  if (store.redo.length === 0) return { store, command: null };
  const last = store.redo[store.redo.length - 1];
  const command = { ...last, status: "applied" as const, undoneAt: undefined };
  return {
    command,
    store: {
      undo: [...store.undo, command].slice(-JOURNAL_UNDO_LIMIT),
      redo: store.redo.slice(0, -1),
      history: store.history.map((item) => (item.id === command.id ? command : item)),
    },
  };
}

export function commandNeedsConfirm(command: JournalCommand): boolean {
  return command.type === "column_delete" || command.type === "column_add";
}

/** Вся история, новые сверху. Без отсечения «последних 20». */
export function historyForPanel(
  items: JournalCommand[],
  isAdmin: boolean,
  currentUserId?: number
): JournalCommand[] {
  const visible = isAdmin
    ? items
    : items.filter((item) => !item.actorUserId || item.actorUserId === currentUserId);
  return [...visible].reverse();
}
