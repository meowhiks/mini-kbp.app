import { describe, expect, it } from "vitest";
import { textFitScale } from "@/lib/client/textFitScale";

describe("textFitScale", () => {
  it("keeps full size when text already fits", () => {
    expect(textFitScale(80, 100)).toBe(1);
  });

  it("shrinks proportionally so a long name fits one line", () => {
    expect(textFitScale(200, 100)).toBe(0.5);
  });

  it("does not shrink below minScale", () => {
    expect(textFitScale(400, 100, 0.5)).toBe(0.5);
  });
});
