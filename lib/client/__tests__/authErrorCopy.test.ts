import { describe, expect, it } from "vitest";
import { friendlyAuthError, INVALID_TOKEN_MESSAGE } from "@/lib/client/authErrorCopy";

describe("friendlyAuthError", () => {
  it("adds retry hint and keeps the original meaning", () => {
    expect(friendlyAuthError("Данный токен недействителен для любого типа токена")).toBe(
      INVALID_TOKEN_MESSAGE
    );
  });

  it("does not duplicate the retry hint", () => {
    expect(friendlyAuthError(INVALID_TOKEN_MESSAGE)).toBe(INVALID_TOKEN_MESSAGE);
  });
});
