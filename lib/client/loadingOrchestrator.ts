export type LoadingScope = "boot" | "refresh" | "action";

export type LoadingState = {
  active: "idle" | LoadingScope;
  counts: Record<LoadingScope, number>;
};

const PRIORITY: LoadingScope[] = ["boot", "action", "refresh"];

type Listener = (state: LoadingState) => void;

const counts: Record<LoadingScope, number> = { boot: 0, refresh: 0, action: 0 };
const listeners = new Set<Listener>();

function snapshot(): LoadingState {
  const active = PRIORITY.find((scope) => counts[scope] > 0) ?? "idle";
  return { active, counts: { ...counts } };
}

function emit() {
  const state = snapshot();
  listeners.forEach((fn) => fn(state));
}

export function beginLoading(scope: LoadingScope): void {
  counts[scope] += 1;
  emit();
}

export function endLoading(scope: LoadingScope): void {
  counts[scope] = Math.max(0, counts[scope] - 1);
  emit();
}

export async function withLoading<T>(scope: LoadingScope, fn: () => Promise<T>): Promise<T> {
  beginLoading(scope);
  try {
    return await fn();
  } finally {
    endLoading(scope);
  }
}

export function getLoadingState(): LoadingState {
  return snapshot();
}

export function subscribeLoading(listener: Listener): () => void {
  listeners.add(listener);
  listener(snapshot());
  return () => listeners.delete(listener);
}

export function resetLoadingOrchestrator(): void {
  counts.boot = 0;
  counts.refresh = 0;
  counts.action = 0;
  emit();
}
