import { describe, expect, it } from "vitest";
import { namesMatch, normalizePersonName } from "../confirmName";

describe("normalizePersonName", () => {
  it("collapses extra spaces and lowercases", () => {
    expect(normalizePersonName("  Иванов   Иван  ")).toBe("иванов иван");
  });
});

describe("namesMatch", () => {
  it("matches names that differ only by spacing and case", () => {
    expect(namesMatch("Иванов Иван", "  иванов   иван ")).toBe(true);
  });

  it("rejects empty confirmation", () => {
    expect(namesMatch("Иванов", "   ")).toBe(false);
  });
});
