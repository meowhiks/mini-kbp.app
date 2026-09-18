/** Session depth of SPA pushes so native Back can walk history when canGoBack is wrong. */

const KEY = "minikbp_spa_history_depth_v1";

function readDepth(): number {
  try {
    const n = Number(sessionStorage.getItem(KEY) || "0");
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

function writeDepth(n: number): void {
  try {
    sessionStorage.setItem(KEY, String(Math.max(0, n)));
  } catch {
    // ignore
  }
}

export function noteSpaHistoryPush(): void {
  writeDepth(readDepth() + 1);
}

export function noteSpaHistoryPop(): void {
  writeDepth(readDepth() - 1);
}

export function getSpaHistoryDepth(): number {
  return readDepth();
}

export function resetSpaHistoryDepth(): void {
  writeDepth(0);
}
