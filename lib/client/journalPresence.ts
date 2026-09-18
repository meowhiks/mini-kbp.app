export const PRESENCE_PALETTE = [
  "#3390ec",
  "#e11d48",
  "#16a34a",
  "#f59e0b",
  "#7c3aed",
  "#0d9488",
  "#db2777",
  "#4f46e5",
];

export type PresencePeer = {
  userId: number;
  name: string;
  studentId: number | null;
  date: string | null;
  slot: number | null;
  updatedAt: number;
};

export function presenceColor(userId: number): string {
  return PRESENCE_PALETTE[Math.abs(userId) % PRESENCE_PALETTE.length];
}

export function presenceCellKey(studentId: number, date: string, slot: number): string {
  return `${studentId}:${date}:${slot}`;
}

export function pruneStalePresence(peers: PresencePeer[], now = Date.now(), staleMs = 8000): PresencePeer[] {
  return peers.filter((peer) => now - peer.updatedAt <= staleMs);
}

export function upsertPresencePeer(peers: PresencePeer[], next: PresencePeer): PresencePeer[] {
  return pruneStalePresence([...peers.filter((peer) => peer.userId !== next.userId), next]);
}
