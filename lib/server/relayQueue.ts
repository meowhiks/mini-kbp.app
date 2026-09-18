import type { KbpUpstreamResult } from "@/lib/server/kbpUpstream";

export type RelayJobPayload = {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
};

type RelayJob = RelayJobPayload & {
  id: string;
  createdAt: number;
  claimedBy?: string;
  claimedAt?: number;
  result?: KbpUpstreamResult;
  error?: string;
  done: boolean;
};

const JOB_TTL_MS = 90_000;
const jobs = new Map<string, RelayJob>();
const pendingIds: string[] = [];
const waiters = new Map<string, Array<(job: RelayJob) => void>>();

function purgeExpired() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) {
      jobs.delete(id);
      waiters.delete(id);
    }
  }
  while (pendingIds.length > 0 && !jobs.has(pendingIds[0]!)) {
    pendingIds.shift();
  }
}

export function createRelayJob(payload: RelayJobPayload): string {
  purgeExpired();
  const id = `relay_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  jobs.set(id, { id, createdAt: Date.now(), done: false, ...payload });
  pendingIds.push(id);
  return id;
}

export function claimRelayJob(workerId: string): RelayJob | null {
  purgeExpired();
  while (pendingIds.length > 0) {
    const id = pendingIds.shift()!;
    const job = jobs.get(id);
    if (!job || job.done) continue;
    job.claimedBy = workerId;
    job.claimedAt = Date.now();
    return job;
  }
  return null;
}

export function completeRelayJob(
  id: string,
  workerId: string,
  outcome: { ok: true; result: KbpUpstreamResult } | { ok: false; error: string }
): boolean {
  const job = jobs.get(id);
  if (!job || job.done) return false;
  if (job.claimedBy && job.claimedBy !== workerId) return false;

  job.done = true;
  if (outcome.ok) job.result = outcome.result;
  else job.error = outcome.error;

  const callbacks = waiters.get(id) || [];
  waiters.delete(id);
  for (const cb of callbacks) cb(job);
  return true;
}

export function waitForRelayJob(id: string, timeoutMs: number): Promise<RelayJob | null> {
  purgeExpired();
  const existing = jobs.get(id);
  if (existing?.done) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      const list = waiters.get(id) || [];
      waiters.set(
        id,
        list.filter((fn) => fn !== onDone)
      );
      resolve(jobs.get(id) ?? null);
    }, timeoutMs);

    const onDone = (job: RelayJob) => {
      clearTimeout(timer);
      resolve(job);
    };

    if (!waiters.has(id)) waiters.set(id, []);
    waiters.get(id)!.push(onDone);
  });
}

export function getRelayJob(id: string): RelayJob | undefined {
  purgeExpired();
  return jobs.get(id);
}
