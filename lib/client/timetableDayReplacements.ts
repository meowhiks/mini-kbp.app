/** День с заменами: флаг dayReplacementStatus или пары added/replaced/removed. */

import { getTimetableDisplayDay } from "@/lib/client/timetableDisplay";

const CHANGE_STATUSES = new Set(["added", "replaced", "removed", "cancelled"]);

export function dayHasReplacements(timetable: any, dayIndex: number): boolean {
  const info = timetable?.dayReplacementStatus?.[dayIndex];
  if (info?.hasChanges) return true;
  if (info?.noChanges) return false;

  const pairs = Array.isArray(timetable?.pairs) ? timetable.pairs : [];
  for (const p of pairs) {
    if (getTimetableDisplayDay(p) !== dayIndex) continue;
    if (CHANGE_STATUSES.has(String(p?.status || ""))) return true;
    if (p?.overlayEvent) return true;
  }
  return false;
}
