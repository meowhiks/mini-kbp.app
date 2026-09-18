export function formatRelativePastRu(iso: string | null | undefined, nowMs = Date.now()): string {
  if (!iso) return "ещё не задан";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "ещё не задан";
  const diff = Math.max(0, nowMs - then);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин. назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч. назад`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} дн. назад`;
  const months = Math.floor(days / 30);
  return `${months} мес. назад`;
}
