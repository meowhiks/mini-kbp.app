import type { StaffSession } from "@/lib/client/miniKbpServer";
import { getServerUrl } from "@/lib/client/serverUrl";
import { platformFetch } from "@/lib/client/platformFetch";
import type { JournalCommand } from "@/lib/client/journalCommands";
import type { JournalConflict } from "@/app/components/staff/JournalSyncModal";
import { listQueuedJournalOps } from "@/lib/client/journalOpQueue";

type BatchResult = {
  applied: string[];
  conflicts: JournalConflict[];
};

async function staffFetch(session: StaffSession, path: string, init: RequestInit = {}) {
  const base = getServerUrl();
  if (!base) throw new Error("Нет URL сервера");
  const resp = await platformFetch(`${base.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access}`,
      ...(init.headers || {}),
    },
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data };
}

function commandToOp(cmd: JournalCommand) {
  return {
    client_op_id: cmd.id,
    type: cmd.type,
    assignment_id: cmd.assignmentId,
    student_id: cmd.target.studentId,
    date: cmd.target.date,
    slot: cmd.target.slot ?? 0,
    value: cmd.after.value ?? "",
    before_value: cmd.before.value ?? "",
  };
}

export async function syncQueuedJournalOps(
  session: StaffSession,
  assignmentId?: number
): Promise<BatchResult> {
  const queued = (await listQueuedJournalOps(assignmentId)).filter((op) => op.status === "queued_offline");
  if (queued.length === 0) return { applied: [], conflicts: [] };
  const r = await staffFetch(session, "/v0/journal-sync/batch/", {
    method: "POST",
    body: JSON.stringify({ ops: queued.map(commandToOp) }),
  });
  if (!r.ok) {
    return { applied: [], conflicts: [] };
  }
  const data = r.data as BatchResult;
  return {
    applied: data.applied ?? [],
    conflicts: data.conflicts ?? [],
  };
}

export async function resolveJournalConflicts(
  session: StaffSession,
  choices: Record<string, "mine" | "server">,
  conflicts: JournalConflict[],
  assignmentId: number
): Promise<{ ok: boolean; conflicts?: JournalConflict[] }> {
  const r = await staffFetch(session, "/v0/journal-sync/resolve/", {
    method: "POST",
    body: JSON.stringify({
      resolutions: conflicts.map((c) => ({
        client_op_id: c.client_op_id,
        choice: choices[c.client_op_id] ?? "server",
        assignment_id: assignmentId,
        student_id: c.student_id,
        date: c.date,
        slot: c.slot,
        client_value: c.client_value,
        server_value: c.server_value,
      })),
    }),
  });
  if (!r.ok) return { ok: false, conflicts };
  const data = r.data as { conflicts?: JournalConflict[] };
  return { ok: true, conflicts: data.conflicts };
}
