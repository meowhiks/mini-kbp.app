import { describe, expect, it } from "vitest";
import {
  buildTimetableSearchParams,
  cachedTimetableMatchesQuery,
  hasTimetableEntity,
  parseTimetableQuery,
  preferTimetableQuery,
  timetableQueryKey,
  buildTimetableEntityHref,
  matchTimetableEntityId,
} from "@/lib/client/timetableQuery";

describe("parseTimetableQuery", () => {
  it("reads type, id and decoded name", () => {
    const q = parseTimetableQuery(
      "tt_type=subject&tt_id=104&tt_name=%D0%9F%D1%80C%D1%80%D0%A1%D0%BE%D0%B7%D0%B4Inter"
    );
    expect(q).toEqual({ type: "subject", id: "104", name: "ПрCрСоздInter" });
    expect(hasTimetableEntity(q)).toBe(true);
    expect(timetableQueryKey(q.type!, q.id!)).toBe("subject:104");
  });

  it("rejects unknown tt_type", () => {
    expect(parseTimetableQuery("tt_type=room&tt_id=1").type).toBeUndefined();
    expect(hasTimetableEntity(parseTimetableQuery("tt_type=subject"))).toBe(false);
  });
});

describe("cachedTimetableMatchesQuery", () => {
  it("lets cache restore when URL has no entity", () => {
    expect(cachedTimetableMatchesQuery({ type: "group", id: "9" }, {})).toBe(true);
  });

  it("blocks a different cached entity when URL names one", () => {
    expect(
      cachedTimetableMatchesQuery({ type: "group", id: "9" }, { type: "subject", id: "104" })
    ).toBe(false);
  });

  it("allows cache when it is the same entity as the URL", () => {
    expect(
      cachedTimetableMatchesQuery({ type: "subject", id: "104" }, { type: "subject", id: "104" })
    ).toBe(true);
  });
});

describe("buildTimetableSearchParams", () => {
  it("keeps unrelated params while writing tt_*", () => {
    const next = buildTimetableSearchParams(new URLSearchParams("foo=1"), {
      type: "subject",
      id: "104",
      name: "Algo",
    });
    expect(next.get("foo")).toBe("1");
    expect(next.get("tt_type")).toBe("subject");
    expect(next.get("tt_id")).toBe("104");
  });
});

describe("preferTimetableQuery", () => {
  it("prefers the URL over a stored query", () => {
    const url = { type: "subject" as const, id: "104", name: "A" };
    const stored = { type: "group" as const, id: "9", name: "B" };
    expect(preferTimetableQuery(url, stored)).toEqual(url);
  });
});

describe("buildTimetableEntityHref", () => {
  it("builds a query URL with page, type, id and name", () => {
    expect(
      buildTimetableEntityHref({ type: "subject", id: "104", name: "ПрCрСоздInter" }, "/journal")
    ).toBe(
      "/journal?page=timetable&tt_type=subject&tt_id=104&tt_name=%D0%9F%D1%80C%D1%80%D0%A1%D0%BE%D0%B7%D0%B4Inter"
    );
  });

  it("keeps type and name when id is missing", () => {
    expect(buildTimetableEntityHref({ type: "teacher", name: "Иванов" }, "/journal")).toBe(
      "/journal?page=timetable&tt_type=teacher&tt_name=%D0%98%D0%B2%D0%B0%D0%BD%D0%BE%D0%B2"
    );
  });

  it("returns null without type or identity", () => {
    expect(buildTimetableEntityHref({ name: "Algo" }, "/journal")).toBeNull();
  });
});

describe("buildTimetableSearchParams page", () => {
  it("sets page=timetable when writing an entity", () => {
    const next = buildTimetableSearchParams(new URLSearchParams("page=journal"), {
      type: "group",
      id: "9",
    });
    expect(next.get("page")).toBe("timetable");
    expect(next.get("tt_id")).toBe("9");
  });
});

describe("matchTimetableEntityId", () => {
  it("matches a subject by normalized name when id is absent", () => {
    const id = matchTimetableEntityId(
      [{ type: "subject", id: "104", name: "ПрCрСоздInter" }],
      "subject",
      "ПрCрСоздInter"
    );
    expect(id).toBe("104");
  });
});

