import { describe, expect, it } from "vitest";
import {
  mergeSameSubjectPairs,
  resolveDayPairs,
  type MergeablePair,
} from "@/lib/client/timetableMergeRows";

function pair(partial: Partial<MergeablePair> & Pick<MergeablePair, "pairNumber" | "subject">): MergeablePair {
  return {
    day: 0,
    teacher: "",
    room: "",
    status: "normal",
    ...partial,
  };
}

describe("mergeSameSubjectPairs", () => {
  it("merges same pairNumber+subject into aligned lines", () => {
    const merged = mergeSameSubjectPairs([
      pair({
        pairNumber: 2,
        subject: "Математика",
        teacher: "Иванов",
        room: "101",
        group: "А",
        refs: {
          subject: { id: "s1", name: "Математика" },
          teachers: [{ id: "t1", name: "Иванов" }],
          place: { id: "p1", name: "101" },
          group: { id: "g1", name: "А" },
        },
      }),
      pair({
        pairNumber: 2,
        subject: "Математика",
        teacher: "Петров",
        room: "205",
        refs: {
          subject: { id: "s1", name: "Математика" },
          teachers: [{ id: "t2", name: "Петров" }],
          place: { id: "p2", name: "205" },
        },
      }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].subject).toBe("Математика");
    expect(merged[0].lines).toEqual([
      {
        group: { label: "А", id: "g1" },
        teacher: { label: "Иванов", id: "t1" },
        room: { label: "101", id: "p1" },
      },
      {
        teacher: { label: "Петров", id: "t2" },
        room: { label: "205", id: "p2" },
      },
    ]);
  });

  it("dedupes identical full lines", () => {
    const merged = mergeSameSubjectPairs([
      pair({ pairNumber: 1, subject: "История", teacher: "Сидоров", room: "1" }),
      pair({ pairNumber: 1, subject: "История", teacher: "Сидоров", room: "1" }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].lines).toHaveLength(1);
  });

  it("keeps different rooms as separate lines even with same teacher", () => {
    const merged = mergeSameSubjectPairs([
      pair({ pairNumber: 1, subject: "История", teacher: "Сидоров", room: "1" }),
      pair({ pairNumber: 1, subject: "История", teacher: "Сидоров", room: "2" }),
    ]);
    expect(merged[0].lines).toHaveLength(2);
    expect(merged[0].lines.map((l) => l.room?.label)).toEqual(["1", "2"]);
  });

  it("keeps different subjects as separate rows", () => {
    const merged = mergeSameSubjectPairs([
      pair({ pairNumber: 3, subject: "Физика", teacher: "A", room: "1" }),
      pair({ pairNumber: 3, subject: "Химия", teacher: "B", room: "2" }),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.map((p) => p.subject)).toEqual(["Физика", "Химия"]);
  });

  it("skips empty lines", () => {
    const merged = mergeSameSubjectPairs([
      pair({ pairNumber: 1, subject: "Физра", teacher: "Козлов", room: "" }),
      pair({ pairNumber: 1, subject: "Физра", teacher: "", room: "" }),
    ]);
    expect(merged[0].lines).toEqual([{ teacher: { label: "Козлов" } }]);
  });

  it("normalizes subject case/whitespace for merge key", () => {
    const merged = mergeSameSubjectPairs([
      pair({ pairNumber: 4, subject: "  Английский ", teacher: "A", room: "1" }),
      pair({ pairNumber: 4, subject: "английский", teacher: "B", room: "2" }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].lines).toHaveLength(2);
  });
});

describe("resolveDayPairs", () => {
  it("keeps same-subject subgroup pairs when replacements are hidden", () => {
    const pairs: MergeablePair[] = [
      pair({
        day: 1,
        pairNumber: 2,
        subject: "Математика",
        teacher: "Иванов",
        room: "101",
      }),
      pair({
        day: 1,
        pairNumber: 2,
        subject: "Математика",
        teacher: "Петров",
        room: "205",
      }),
      pair({
        day: 1,
        pairNumber: 2,
        subject: "Математика",
        teacher: "Лишний",
        room: "999",
        status: "added",
      }),
    ];

    const resolved = resolveDayPairs(pairs, 1, false);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].lines.map((l) => l.teacher?.label)).toEqual(["Иванов", "Петров"]);
    expect(resolved[0].lines.map((l) => l.room?.label)).toEqual(["101", "205"]);
  });

  it("merges same-subject pairs when replacements are shown", () => {
    const pairs: MergeablePair[] = [
      pair({ day: 0, pairNumber: 1, subject: "Биология", teacher: "A", room: "1", status: "normal" }),
      pair({ day: 0, pairNumber: 1, subject: "Биология", teacher: "B", room: "2", status: "normal" }),
    ];
    const resolved = resolveDayPairs(pairs, 0, true);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].lines).toHaveLength(2);
  });

  it("ON: shows added, hides removed", () => {
    const pairs: MergeablePair[] = [
      pair({
        day: 0,
        pairNumber: 3,
        subject: "История",
        teacher: "Сидоров",
        room: "12",
        status: "removed",
      }),
      pair({
        day: 0,
        pairNumber: 3,
        subject: "Физика",
        teacher: "Козлов",
        room: "305",
        status: "added",
      }),
    ];

    const resolved = resolveDayPairs(pairs, 0, true);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].subject).toBe("Физика");
    expect(resolved[0].status).toBe("added");
    expect(resolved[0].teacher).toBe("Козлов");
    expect(resolved[0].room).toBe("305");
  });

  it("OFF: hides added, shows removed in red status", () => {
    const pairs: MergeablePair[] = [
      pair({
        day: 0,
        pairNumber: 3,
        subject: "История",
        teacher: "Сидоров",
        room: "12",
        status: "removed",
      }),
      pair({
        day: 0,
        pairNumber: 3,
        subject: "Физика",
        teacher: "Козлов",
        room: "305",
        status: "added",
      }),
    ];

    const resolved = resolveDayPairs(pairs, 0, false);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].subject).toBe("История");
    expect(resolved[0].status).toBe("removed");
    expect(resolved[0].teacher).toBe("Сидоров");
    expect(resolved[0].room).toBe("12");
  });

  it("ON: removed-only slot is hidden", () => {
    const pairs: MergeablePair[] = [
      pair({
        day: 2,
        pairNumber: 1,
        subject: "Химия",
        teacher: "Белова",
        room: "210",
        status: "removed",
      }),
    ];

    expect(resolveDayPairs(pairs, 2, true)).toEqual([]);
  });

  it("OFF: removed-only slot keeps removed status", () => {
    const pairs: MergeablePair[] = [
      pair({
        day: 2,
        pairNumber: 1,
        subject: "Химия",
        teacher: "Белова",
        room: "210",
        status: "removed",
      }),
    ];

    const resolved = resolveDayPairs(pairs, 2, false);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].subject).toBe("Химия");
    expect(resolved[0].status).toBe("removed");
    expect(resolved[0].teacher).toBe("Белова");
    expect(resolved[0].room).toBe("210");
  });

  it("ON: keeps replaced and normal lessons", () => {
    const pairs: MergeablePair[] = [
      pair({
        day: 1,
        pairNumber: 4,
        subject: "Информатика",
        teacher: "Новиков",
        room: "401",
        status: "replaced",
      }),
      pair({
        day: 1,
        pairNumber: 5,
        subject: "Физра",
        teacher: "Козлов",
        room: "зал",
        status: "normal",
      }),
    ];

    const resolved = resolveDayPairs(pairs, 1, true);
    expect(resolved.map((p) => p.subject)).toEqual(["Информатика", "Физра"]);
    expect(resolved[0].status).toBe("replaced");
  });

  it("strips teacher/room for Урок снят subject", () => {
    const pairs: MergeablePair[] = [
      pair({
        day: 0,
        pairNumber: 2,
        subject: "Урок снят",
        teacher: "Белова",
        room: "210",
        status: "added",
        refs: {
          teachers: [{ id: "t1", name: "Белова" }],
          place: { id: "p1", name: "210" },
        },
      }),
    ];

    const resolved = resolveDayPairs(pairs, 0, true);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].subject).toBe("Урок снят");
    expect(resolved[0].teacher).toBe("");
    expect(resolved[0].room).toBe("");
    expect(resolved[0].lines).toEqual([]);
  });
});
