import { describe, expect, it } from "vitest";
import { parseAppQuery, stripVerifyDoFromSearch } from "@/lib/client/appQuery";

describe("stripVerifyDoFromSearch", () => {
  it("removes do=verify and keeps other params", () => {
    expect(stripVerifyDoFromSearch("?do=verify&q=/journal")).toBe("?q=%2Fjournal");
  });

  it("leaves unrelated do values", () => {
    expect(stripVerifyDoFromSearch("?do=register")).toBe("?do=register");
  });

  it("returns empty search when verify was the only param", () => {
    expect(stripVerifyDoFromSearch("do=verify")).toBe("");
  });
});

describe("parseAppQuery", () => {
  it("reads verify action", () => {
    expect(parseAppQuery("?do=verify").do).toBe("verify");
  });
});
