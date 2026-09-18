export const OFFLINE_BANNER_MS = 8000;

export function offlineBannerProgress(elapsedMs: number, durationMs = OFFLINE_BANNER_MS): number {
  if (durationMs <= 0) return 0;
  return Math.max(0, Math.min(1, 1 - elapsedMs / durationMs));
}
