import { getServerUrl } from "@/lib/client/serverUrl";
import { platformFetch } from "@/lib/client/platformFetch";

const PROBE_TTL_MS = 30_000;
let lastProbe: { at: number; ok: boolean } | null = null;

/** Проверка доступности lk — кэш 30 с, чтобы не спамить. */
export async function probeServerReachable(force = false): Promise<boolean> {
  if (!force && lastProbe && Date.now() - lastProbe.at < PROBE_TTL_MS) {
    return lastProbe.ok;
  }
  const base = getServerUrl();
  if (!base) {
    lastProbe = { at: Date.now(), ok: false };
    return false;
  }
  try {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 8000);
    const res = await platformFetch(`${base}/v0/public/app-config/`, {
      method: "GET",
      signal: ctrl.signal,
      cache: "no-store",
    });
    window.clearTimeout(timer);
    const ok = res.ok;
    lastProbe = { at: Date.now(), ok };
    return ok;
  } catch {
    lastProbe = { at: Date.now(), ok: false };
    return false;
  }
}

export function resetServerReachabilityCache(): void {
  lastProbe = null;
}
