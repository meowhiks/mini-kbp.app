import { describe, expect, it } from "vitest";
import { formatRelativePastRu } from "@/lib/client/formatRelativeRu";

describe("formatRelativePastRu", () => {
  it("returns a fallback when the timestamp is missing", () => {
    expect(formatRelativePastRu(null)).toBe("ещё не задан");
  });

  it("describes a change from a few minutes ago", () => {
    const at = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    expect(formatRelativePastRu(at)).toBe("3 мин. назад");
  });
});
