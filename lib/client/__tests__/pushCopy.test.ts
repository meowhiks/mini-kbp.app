import { describe, expect, it } from "vitest";
import { gradePushCopy, replacementPushCopy } from "@/lib/client/pushCopy";

describe("pushCopy", () => {
  it("formats grade notification", () => {
    expect(gradePushCopy("Математика", "8")).toEqual({
      title: "Математика",
      body: "У вас новые отметки : 8",
    });
  });

  it("formats replacement notification", () => {
    expect(replacementPushCopy(3, "Физкультура", "Информатика")).toEqual({
      title: "Замена 3 урока!",
      body: "Физкультура вместо Информатика",
    });
  });
});
