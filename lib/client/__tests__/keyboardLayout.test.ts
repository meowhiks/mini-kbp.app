import { describe, expect, it } from "vitest";
import { searchQueryVariants, swapKeyboardLayout } from "@/lib/client/keyboardLayout";

describe("swapKeyboardLayout", () => {
  it("converts latin typed as russian intent", () => {
    // "щзф" typed on EN layout as "popa" wait - "группа" on EN keys:
    // г=u, р=h, у=e, п=g, п=g, а=f → "uheggf"
    expect(swapKeyboardLayout("uheggf")).toBe("группа");
  });

  it("converts cyrillic typed as english intent", () => {
    expect(swapKeyboardLayout("группа")).toBe("uheggf");
  });
});

describe("searchQueryVariants", () => {
  it("returns original and swapped", () => {
    expect(searchQueryVariants("uheggf")).toEqual(["uheggf", "группа"]);
  });

  it("dedupes when swap is identity", () => {
    expect(searchQueryVariants("123")).toEqual(["123"]);
  });
});
