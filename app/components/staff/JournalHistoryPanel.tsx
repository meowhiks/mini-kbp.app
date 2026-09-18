"use client";

import type { JournalCommand } from "@/lib/client/journalCommands";
import { historyForPanel } from "@/lib/client/journalCommands";

type JournalHistoryPanelProps = {
  items: JournalCommand[];
  isAdmin: boolean;
  currentUserId?: number;
  isDark?: boolean;
  liftAboveNav?: boolean;
  onUndo: (command: JournalCommand) => void;
  onRedo?: (command: JournalCommand) => void;
  onHover?: (command: JournalCommand | null) => void;
  onClose: () => void;
};

function labelFor(command: JournalCommand): string {
  const from = command.before.value ?? "—";
  const to = command.after.value ?? "—";
  if (command.type === "grade_set" || command.type === "grade_delete") {
    return `${from} → ${to}`;
  }
  if (command.type === "lateness") {
    return `${command.before.minutes ?? 0}м → ${command.after.minutes ?? 0}м`;
  }
  return command.type;
}

export default function JournalHistoryPanel({
  items,
  isAdmin,
  currentUserId,
  isDark = false,
  liftAboveNav = false,
  onUndo,
  onClose,
}: JournalHistoryPanelProps) {
  const page = historyForPanel(items, isAdmin, currentUserId);
  const navPad = liftAboveNav ? "bottom-[calc(3.25rem+env(safe-area-inset-bottom,0px))]" : "bottom-0";

  return (
    <aside
      className={`fixed inset-y-0 right-0 z-[250] flex w-full max-w-sm flex-col border-l shadow-xl ${navPad} ${
        isDark ? "border-zinc-800 bg-zinc-950 text-zinc-100" : "border-gray-200 bg-white"
      }`}
    >
      <div className={`flex items-center justify-between border-b px-4 py-3 ${isDark ? "border-zinc-800" : ""}`}>
        <h2 className="text-sm font-semibold">История действий</h2>
        <button
          type="button"
          className={`text-sm ${isDark ? "text-zinc-400 hover:text-zinc-200" : "text-gray-500 hover:text-gray-800"}`}
          onClick={onClose}
        >
          Закрыть
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {page.length === 0 ? (
          <p className={`text-sm ${isDark ? "text-zinc-400" : "text-gray-500"}`}>Пока нет действий</p>
        ) : (
          <ul className="space-y-2">
            {page.map((item) => (
              <li
                key={item.id}
                className={`rounded-xl border p-3 text-sm ${isDark ? "border-zinc-800" : "border-gray-100"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{labelFor(item)}</span>
                  {item.status === "queued_offline" ? (
                    <span className="text-[10px] uppercase text-amber-600">offline</span>
                  ) : null}
                </div>
                <p className={`mt-1 text-xs ${isDark ? "text-zinc-500" : "text-gray-500"}`}>
                  {item.target.date ?? ""} {item.status === "undone" ? "· отменено" : ""}
                </p>
                {item.status !== "undone" ? (
                  <button
                    type="button"
                    className="mt-2 text-xs font-medium text-[#3390ec]"
                    onClick={() => onUndo(item)}
                  >
                    Отменить
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
