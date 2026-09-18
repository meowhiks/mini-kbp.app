/** Поля, которые Telegram Login Widget передаёт при авторизации. */
export const TELEGRAM_LOGIN_FIELDS = new Set([
  "id",
  "first_name",
  "last_name",
  "username",
  "photo_url",
  "auth_date",
  "hash",
]);

export function pickTelegramAuthPayload(
  data: Record<string, string | number | undefined | null>
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!TELEGRAM_LOGIN_FIELDS.has(key)) continue;
    if (value === undefined || value === null || value === "") continue;
    out[key] = value;
  }
  return out;
}

/** Результат telegram-login.js: { id_token, user } или legacy widget-поля. */
export function normalizeTelegramLoginResult(
  result: Record<string, unknown>
): Record<string, string | number> & { id_token?: string } {
  if (typeof result.error === "string") {
    const msg =
      result.error === "popup_closed"
        ? "Вход через Telegram отменён"
        : result.error === "missing id_token"
          ? "Telegram не вернул токен. Попробуйте ещё раз."
          : result.error;
    throw new Error(msg);
  }
  if (result.user && typeof result.user === "object" && typeof result.id_token === "string") {
    return { id_token: result.id_token.trim() };
  }
  if (typeof result.id_token === "string" && result.id_token.trim()) {
    return { id_token: result.id_token.trim() };
  }
  return pickTelegramAuthPayload(result as Record<string, string | number>);
}
