import { describe, expect, it } from "vitest";
import {
  applyReplacementsOverlay,
  entryMatchesEntity,
  type OverlayResponse,
} from "@/lib/client/timetableOverlay";

const baseTimetable = {
  groupId: "591",
  groupName: "591Т",
  currentWeek: { dateRange: "1 — 6 сентября", weekLabel: "тек. нед." },
  pairs: [
    {
      pairNumber: 7,
      day: 4,
      dayName: "Пятница",
      subject: "ИнтрументПО",
      teacher: "Старый",
      room: "100",
      status: "normal",
      refs: { teachers: [] },
    },
  ],
  dayReplacementStatus: Array.from({ length: 6 }, () => ({
    label: "",
    hasChanges: false,
    noChanges: true,
    unknown: false,
  })),
};

describe("timetableOverlay", () => {
  it("matches group by kbp id and code", () => {
    const entry = {
      date: "2026-09-04",
      group_code: "591Т",
      kbp_group_id: "591",
      lesson_number: 7,
      event_type: "REPLACEMENT" as const,
      replacement_data: {},
      original_data: {},
    };
    expect(entryMatchesEntity(entry, { type: "group", id: "591", name: "591Т" })).toBe(true);
    expect(entryMatchesEntity(entry, { type: "group", id: "999", name: "Другая" })).toBe(false);
  });

  it("matches group П-491 with sheet variants 491п / 491-П", () => {
    const entry = {
      date: "2026-09-04",
      group_code: "491п",
      lesson_number: 1,
      event_type: "REPLACEMENT" as const,
      replacement_data: { room: "ауд. 410", subject: "ВебПрогСтСерв", teachers: ["Шкабура А.Д."] },
      original_data: {},
    };
    expect(entryMatchesEntity(entry, { type: "group", id: "491", name: "П-491" })).toBe(true);
    expect(entryMatchesEntity(entry, { type: "group", id: "491", name: "491П" })).toBe(true);
    expect(entryMatchesEntity(entry, { type: "group", id: "494", name: "Т-494" })).toBe(false);
    expect(entryMatchesEntity(entry, { type: "place", id: "410", name: "410" })).toBe(true);
  });

  it("applies REPLACEMENT NEW_LESSON CANCELLATION", () => {
    // Friday 2026-09-04: week starting Mon 2026-08-31 → Fri is day 4
    // dateRange "1 — 6 сентября" with ref around Sep 2026
    const overlay: OverlayResponse = {
      from: "2026-09-01",
      to: "2026-09-06",
      days: {
        "2026-09-05": [
          {
            date: "2026-09-05",
            group_code: "591Т",
            kbp_group_id: "591",
            lesson_number: 7,
            event_type: "REPLACEMENT",
            replacement_data: {
              subject: "ОхрОкрСрЭнерг",
              room: "319",
              teachers: ["Янушкевич Е.В."],
            },
            original_data: { subject: "ИнтрументПО", room: null, teachers: [] },
          },
          {
            date: "2026-09-05",
            group_code: "591Т",
            kbp_group_id: "591",
            lesson_number: 8,
            event_type: "NEW_LESSON",
            replacement_data: {
              subject: "ОхрОкрСрЭнерг",
              room: "319",
              teachers: ["Янушкевич Е.В."],
            },
            original_data: { subject: null, room: null, teachers: [] },
          },
          {
            date: "2026-09-05",
            group_code: "591Т",
            kbp_group_id: "591",
            lesson_number: 11,
            event_type: "CANCELLATION",
            replacement_data: { subject: null, room: null, teachers: [] },
            original_data: {
              subject: "ОргПроизвод",
              room: "520",
              teachers: ["Свирид Д.И."],
            },
          },
        ],
      },
    };

    // Force week dates via explicit ISO mapping: patch currentWeek so day4 = Sep 5
    // parseTimetableWeekDates("1 — 6 сентября") with ref Sep 2026 → Sep 1..6, day4 = Sep 5
    const tt = {
      ...baseTimetable,
      pairs: [
        {
          ...baseTimetable.pairs[0],
          day: 4,
        },
      ],
    };

    const merged = applyReplacementsOverlay(tt, overlay, {
      type: "group",
      id: "591",
      name: "591Т",
    });

    const p7 = merged.pairs.find((p: any) => p.pairNumber === 7 && p.day === 4);
    expect(p7.status).toBe("replaced");
    expect(p7.subject).toBe("ОхрОкрСрЭнерг");
    expect(p7.room).toBe("319");

    const p8 = merged.pairs.find((p: any) => p.pairNumber === 8);
    expect(p8).toBeTruthy();
    expect(p8.status).toBe("added");

    const p11 = merged.pairs.find((p: any) => p.pairNumber === 11);
    expect(p11).toBeTruthy();
    expect(p11.status).toBe("removed");
  });
});
