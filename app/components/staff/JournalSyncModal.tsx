"use client";

export type JournalConflict = {
  client_op_id: string;
  student_id: number;
  date: string;
  slot: number;
  client_value: string;
  server_value: string;
};

type JournalSyncModalProps = {
  conflicts: JournalConflict[];
  onResolve: (choices: Record<string, "mine" | "server">) => void;
  onClose: () => void;
};

export default function JournalSyncModal({ conflicts, onResolve, onClose }: JournalSyncModalProps) {
  return (
    <div className="fixed inset-0 z-[360] flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-2xl border border-black bg-white shadow-2xl">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Конфликт изменений</h2>
          <p className="mt-1 text-xs text-gray-500">Выберите, какие значения применить. Автоматически ничего не перезаписывается.</p>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-4">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-gray-500">
                <th className="pb-2">Ячейка</th>
                <th className="pb-2">Ваше</th>
                <th className="pb-2">На сервере</th>
              </tr>
            </thead>
            <tbody>
              {conflicts.map((c) => (
                <tr key={c.client_op_id} className="border-t">
                  <td className="py-2">{c.date} #{c.slot}</td>
                  <td className="py-2">{c.client_value || "—"}</td>
                  <td className="py-2">{c.server_value || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-2 border-t p-3">
          <button type="button" className="flex-1 rounded-xl border border-black px-3 py-2 text-sm" onClick={onClose}>
            Позже
          </button>
          <button
            type="button"
            className="flex-1 rounded-xl border border-black bg-[#3390ec] px-3 py-2 text-sm text-white"
            onClick={() => {
              const choices: Record<string, "mine" | "server"> = {};
              for (const c of conflicts) choices[c.client_op_id] = "mine";
              onResolve(choices);
            }}
          >
            Применить мои
          </button>
          <button
            type="button"
            className="flex-1 rounded-xl border border-black px-3 py-2 text-sm"
            onClick={() => {
              const choices: Record<string, "mine" | "server"> = {};
              for (const c of conflicts) choices[c.client_op_id] = "server";
              onResolve(choices);
            }}
          >
            Взять с сервера
          </button>
        </div>
      </div>
    </div>
  );
}
