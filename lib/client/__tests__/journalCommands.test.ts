import { describe, expect, it } from "vitest";
import {
  emptyCommandStore,
  historyForPanel,
  pushCommand,
  redoCommand,
  undoCommand,
  JOURNAL_UNDO_LIMIT,
  type JournalCommand,
} from "@/lib/client/journalCommands";

function sampleCommand(id: string): JournalCommand {
  return {
    id,
    type: "grade_set",
    assignmentId: 1,
    target: { studentId: 1, date: "2026-03-01", slot: 0 },
    before: { value: "4" },
    after: { value: "5" },
    status: "applied",
    createdAt: Date.now(),
  };
}

describe("journalCommands", () => {
  it("pushCommand clears redo stack", () => {
    let store = pushCommand(emptyCommandStore(), sampleCommand("a"));
    const undone = undoCommand(store);
    expect(undone.command?.id).toBe("a");
    store = pushCommand(undone.store, sampleCommand("c"));
    expect(store.redo).toHaveLength(0);
  });

  it("undo and redo round-trip", () => {
    let store = pushCommand(emptyCommandStore(), sampleCommand("x"));
    const u = undoCommand(store);
    expect(u.command?.status).toBe("undone");
    store = u.store;
    const r = redoCommand(store);
    expect(r.command?.status).toBe("applied");
  });

  it("limits undo depth", () => {
    let store = emptyCommandStore();
    for (let i = 0; i < JOURNAL_UNDO_LIMIT + 5; i += 1) {
      store = pushCommand(store, sampleCommand(`cmd-${i}`));
    }
    expect(store.undo.length).toBe(JOURNAL_UNDO_LIMIT);
  });

  it("keeps full history beyond the undo window", () => {
    let store = emptyCommandStore();
    for (let i = 0; i < JOURNAL_UNDO_LIMIT + 5; i += 1) {
      store = pushCommand(store, sampleCommand(`cmd-${i}`));
    }
    expect(store.history.length).toBe(JOURNAL_UNDO_LIMIT + 5);
  });

  it("shows entire history newest first, not only the last 20", () => {
    const items = Array.from({ length: 25 }, (_, i) => sampleCommand(`cmd-${i}`));
    const page = historyForPanel(items, true, 1);
    expect(page).toHaveLength(25);
    expect(page[0]?.id).toBe("cmd-24");
    expect(page[24]?.id).toBe("cmd-0");
  });
});
