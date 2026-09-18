import { useCallback, useEffect, useRef, useState } from "react";
import type { StaffSession } from "@/lib/client/miniKbpServer";
import { getServerUrl } from "@/lib/client/serverUrl";
import {
  pruneStalePresence,
  type PresencePeer,
  upsertPresencePeer,
} from "@/lib/client/journalPresence";

type RawPeer = {
  user_id: number;
  name: string;
  student_id: number | null;
  date: string | null;
  slot: number | null;
  updated_at: number;
};

function mapPeer(raw: RawPeer): PresencePeer {
  return {
    userId: raw.user_id,
    name: raw.name,
    studentId: raw.student_id,
    date: raw.date,
    slot: raw.slot,
    updatedAt: raw.updated_at * 1000,
  };
}

async function parseSseStream(
  resp: Response,
  onData: (peers: PresencePeer[]) => void,
  signal: AbortSignal
) {
  const reader = resp.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  while (!signal.aborted) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      try {
        const payload = JSON.parse(line.slice(6)) as { peers?: RawPeer[] };
        const peers = (payload.peers ?? []).map(mapPeer);
        onData(pruneStalePresence(peers));
      } catch {
        // ignore malformed chunk
      }
    }
  }
}

export function useJournalPresence(
  session: StaffSession | null,
  assignmentId: number | null,
  enabled = false
) {
  const [peers, setPeers] = useState<PresencePeer[]>([]);
  const selfRef = useRef<PresencePeer | null>(null);

  const sendHeartbeat = useCallback(
    async (cell?: { studentId: number; date: string; slot: number }) => {
      if (!enabled || !session || !assignmentId) return;
      const base = getServerUrl();
      if (!base) return;
      try {
        await fetch(`${base.replace(/\/$/, "")}/v0/journal-presence/heartbeat/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access}`,
          },
          body: JSON.stringify({
            assignment_id: assignmentId,
            student_id: cell?.studentId ?? null,
            date: cell?.date ?? null,
            slot: cell?.slot ?? null,
          }),
        });
        if (cell && session.teacherId) {
          const self: PresencePeer = {
            userId: session.teacherId,
            name: session.fullName ?? session.username ?? "Вы",
            studentId: cell.studentId,
            date: cell.date,
            slot: cell.slot,
            updatedAt: Date.now(),
          };
          selfRef.current = self;
          setPeers((prev) => upsertPresencePeer(prev, self));
        }
      } catch {
        // offline
      }
    },
    [enabled, session, assignmentId]
  );

  useEffect(() => {
    if (!enabled || !session || !assignmentId) {
      setPeers([]);
      return;
    }
    const base = getServerUrl();
    if (!base) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const resp = await fetch(
          `${base.replace(/\/$/, "")}/v0/journal-presence/stream/?assignment=${assignmentId}`,
          {
            headers: { Authorization: `Bearer ${session.access}` },
            signal: controller.signal,
          }
        );
        if (!resp.ok) return;
        await parseSseStream(resp, setPeers, controller.signal);
      } catch {
        // stream closed
      }
    })();
    const pruneId = window.setInterval(() => {
      setPeers((prev) => pruneStalePresence(prev));
    }, 4000);
    return () => {
      controller.abort();
      window.clearInterval(pruneId);
    };
  }, [enabled, session, assignmentId]);

  return { peers, sendHeartbeat };
}
