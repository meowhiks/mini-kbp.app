import { describe, expect, it } from "vitest";
import { encodeTelegramOidcState, resolveTelegramOidcLogin } from "@/lib/client/telegramOidcRedirect";

describe("resolveTelegramOidcLogin", () => {
  it("reads verifier from encoded state when sessionStorage is empty", () => {
    const verifier = "a".repeat(32);
    const state = encodeTelegramOidcState(verifier);
    const resolved = resolveTelegramOidcLogin(state);
    expect(resolved?.verifier).toBe(verifier);
    expect(resolved?.redirectUri).toContain("/auth/telegram");
  });
});
