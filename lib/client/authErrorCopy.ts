export const INVALID_TOKEN_MESSAGE =
  "Данный токен недействителен для любого типа токена. Попробуйте ещё раз.";

export function friendlyAuthError(detail: string): string {
  const d = (detail || "").trim();
  if (!d) return INVALID_TOKEN_MESSAGE;
  if (d.includes("недействителен для любого типа токена") && !d.toLowerCase().includes("попробуйте")) {
    return INVALID_TOKEN_MESSAGE;
  }
  if (d.toLowerCase().includes("not valid for any token type")) {
    return INVALID_TOKEN_MESSAGE;
  }
  return d;
}
