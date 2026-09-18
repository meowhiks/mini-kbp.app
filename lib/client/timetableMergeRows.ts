import { pairMatchesDisplayDay } from "@/lib/client/timetableDisplay";

export type PairEntityRef = {
  label: string;
  id?: string;
};

export type MergeablePair = {
  pairNumber: number;
  day: number;
  weekOffset?: number;
  dayName?: string;
  subject: string;
  teacher: string;
  room: string;
  group?: string;
  refs?: {
    subject?: { id: string; name: string };
    place?: { id: string; name: string };
    group?: { id: string; name: string };
    teachers?: Array<{ id: string; name: string }>;
  };
  status: string;
};

/** One subgroup/variant line: group + teacher + room together. */
export type MergedPairLine = {
  group?: PairEntityRef;
  teacher?: PairEntityRef;
  room?: PairEntityRef;
};

export type MergedPair = MergeablePair & {
  lines: MergedPairLine[];
};

const LESSON_CANCELLED_SUBJECT = "Урок снят";

function normalizeKey(value: string): string {
  return (value || "").trim().toLowerCase();
}

function subjectMergeKey(pair: MergeablePair): string {
  return `${pair.pairNumber}::${normalizeKey(pair.subject)}`;
}

function refFrom(label: string | undefined, id?: string): PairEntityRef | undefined {
  const trimmed = (label || "").trim();
  if (!trimmed) return undefined;
  return id ? { label: trimmed, id } : { label: trimmed };
}

function lineFromPair(pair: MergeablePair): MergedPairLine {
  const teacherFromRefs = pair.refs?.teachers?.[0];
  return {
    group: refFrom(pair.group, pair.refs?.group?.id),
    teacher: refFrom(
      teacherFromRefs?.name || pair.teacher,
      teacherFromRefs?.id ?? pair.refs?.teachers?.[0]?.id
    ),
    room: refFrom(pair.room, pair.refs?.place?.id),
  };
}

function lineKey(line: MergedPairLine): string {
  return [
    normalizeKey(line.group?.label || ""),
    normalizeKey(line.teacher?.label || ""),
    normalizeKey(line.room?.label || ""),
  ].join("|");
}

function lineHasContent(line: MergedPairLine): boolean {
  return Boolean(line.group || line.teacher || line.room);
}

function isRemoved(status: string): boolean {
  return status === "removed" || status === "cancelled";
}

function isLessonCancelledSubject(subject: string): boolean {
  return (subject || "").trim() === LESSON_CANCELLED_SUBJECT;
}

/**
 * Collapse pairs with the same pairNumber + subject into one card,
 * keeping each source pair as an aligned group/teacher/room line.
 */
export function mergeSameSubjectPairs(pairs: MergeablePair[]): MergedPair[] {
  const order: string[] = [];
  const buckets = new Map<string, MergeablePair[]>();

  for (const pair of pairs) {
    const key = subjectMergeKey(pair);
    if (!buckets.has(key)) {
      order.push(key);
      buckets.set(key, []);
    }
    buckets.get(key)!.push(pair);
  }

  return order.map((key) => {
    const group = buckets.get(key)!;
    const base = group[0];
    const lines: MergedPairLine[] = [];
    const seen = new Set<string>();

    for (const p of group) {
      const line = lineFromPair(p);
      if (!lineHasContent(line)) continue;
      const lk = lineKey(line);
      if (seen.has(lk)) continue;
      seen.add(lk);
      lines.push(line);
    }

    const first = lines[0];
    return {
      ...base,
      teacher: first?.teacher?.label ?? base.teacher,
      room: first?.room?.label ?? base.room,
      group: first?.group?.label ?? base.group,
      lines,
    };
  });
}

/** «Урок снят» — без учителя, кабинета и группы. */
function stripCancelledMeta(pair: MergeablePair): MergeablePair {
  return {
    ...pair,
    teacher: "",
    room: "",
    group: undefined,
    refs: pair.refs
      ? {
          ...pair.refs,
          teachers: [],
          place: undefined,
          group: undefined,
        }
      : undefined,
  };
}

/**
 * 1) Фильтр замен:
 *    ON  — показать added, скрыть removed
 *    OFF — скрыть added, показать removed (красные)
 * 2) Слияние одинаковых предметов.
 */
export function resolveDayPairs(
  allPairs: MergeablePair[],
  dayIndex: number,
  showReplacements: boolean
): MergedPair[] {
  const filtered = allPairs
    .filter((p) => pairMatchesDisplayDay(p, dayIndex))
    .filter((p) => {
      if (showReplacements) {
        // Замены: added видны, removed скрыты
        return !isRemoved(p.status);
      }
      // Обычное расписание: added скрыты, removed видны
      return p.status !== "added";
    })
    .map((p) => (isLessonCancelledSubject(p.subject) ? stripCancelledMeta(p) : p))
    .sort((a, b) => a.pairNumber - b.pairNumber);

  return mergeSameSubjectPairs(filtered);
}
