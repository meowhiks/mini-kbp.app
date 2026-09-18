export const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;

const NAME_RE = /^\p{L}+(?:[ \-'.]\p{L}+)*$/u;
const PHONE_RE = /^\+?[0-9][0-9\s\-()]{5,24}$/;

export function isAllowedDisplayName(value: string): boolean {
  const raw = value.trim();
  if (!raw) return true;
  if (raw.length > 255) return false;
  return NAME_RE.test(raw);
}

export function isAllowedPhone(value: string): boolean {
  const raw = value.trim();
  if (!raw) return true;
  return PHONE_RE.test(raw);
}

export function isAllowedInfo(value: string): boolean {
  if (value.length > 2000) return false;
  return !/[<>]/.test(value);
}

export function isAllowedAvatarFile(file: { type: string; name: string }): boolean {
  const type = (file.type || "").toLowerCase();
  if (type === "image/svg+xml") return false;
  if ((ALLOWED_AVATAR_TYPES as readonly string[]).includes(type)) return true;
  const name = (file.name || "").toLowerCase();
  if (type && !type.startsWith("image/")) return false;
  return /\.(jpe?g|png|gif|webp)$/.test(name);
}
