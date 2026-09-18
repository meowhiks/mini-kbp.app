/** Ссылки и QR для кодов приглашения куратора / панели. */

import { getPublicLkOrigin } from "@/lib/client/lkAppUrl";

export function normalizeInviteCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

/** Публичная ссылка входа с кодом приглашения (регистрация в форке отключена). */
export function buildRoleInviteUrl(code: string, origin?: string): string {
  const base = (origin ?? getPublicLkOrigin()).replace(/\/+$/, "");
  const params = new URLSearchParams({
    invite: normalizeInviteCode(code),
  });
  return `${base}/?${params.toString()}`;
}

export function inviteCodeFromUrl(search: string): string | undefined {
  const sp = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const raw = sp.get("invite")?.trim();
  if (!raw) return undefined;
  const code = normalizeInviteCode(raw);
  return code.length >= 4 ? code : undefined;
}
