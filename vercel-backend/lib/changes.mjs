const DAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Пн"];

function pairKey(p) {
  return `${p.weekOffset ?? 0}:${p.day}:${p.pairNumber}:${p.subject}:${p.status}:${p.teacher}:${p.room}`;
}

export function detectTimetableChanges(oldData, newData) {
  const changes = [];
  if (!oldData || !newData) return changes;

  const oldPairs = new Map();
  for (const p of oldData.pairs || []) {
    oldPairs.set(`${p.weekOffset ?? 0}-${p.day}-${p.pairNumber}`, p);
  }

  for (const p of newData.pairs || []) {
    const key = `${p.weekOffset ?? 0}-${p.day}-${p.pairNumber}`;
    const old = oldPairs.get(key);
    const dayLabel = DAY_NAMES[p.day] ?? "?";

    if (!old) {
      changes.push({
        type: "timetable",
        message: `Новая пара: ${p.subject} (${dayLabel}, ${p.pairNumber} пара)`,
      });
      continue;
    }

    if (old.status !== p.status) {
      const statusText =
        p.status === "added"
          ? "добавлена"
          : p.status === "removed"
            ? "снята"
            : p.status === "cancelled"
              ? "отменена"
              : "изменена";
      changes.push({
        type: "timetable",
        message: `Расписание: ${p.subject} ${statusText} (${dayLabel})`,
      });
    } else if (
      old.subject !== p.subject ||
      old.teacher !== p.teacher ||
      old.room !== p.room
    ) {
      changes.push({
        type: "timetable",
        message: `Изменение: ${p.subject} (${dayLabel}, ${p.pairNumber} пара)`,
      });
    }
  }

  const oldRepl = oldData.dayReplacementStatus || [];
  const newRepl = newData.dayReplacementStatus || [];
  for (let i = 0; i < newRepl.length; i++) {
    const o = oldRepl[i];
    const n = newRepl[i];
    if (!n) continue;
    const was = o?.label || "";
    const now = n.label || "";
    if (was !== now && (n.hasChanges || /показать\s+замены/i.test(now))) {
      changes.push({
        type: "timetable",
        message: `Замены: ${DAY_NAMES[i] ?? "день"} — ${now.replace(/\s+/g, " ").trim()}`,
      });
    }
  }

  return changes;
}

export function snapshotFingerprint(data) {
  const pairs = (data?.pairs || []).map(pairKey).sort();
  const repl = (data?.dayReplacementStatus || []).map((d) => d?.label || "").join("|");
  return `${pairs.join(";")}#${repl}`;
}
