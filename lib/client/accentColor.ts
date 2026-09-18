/** Accent presets for timetable fork (Telegram-like). */

export const ACCENT_PRESETS = [
  { id: "blue", label: "Синий", hex: "#3390ec" },
  { id: "green", label: "Зелёный", hex: "#31b545" },
  { id: "purple", label: "Фиолетовый", hex: "#8b5cf6" },
  { id: "orange", label: "Оранжевый", hex: "#f59e0b" },
  { id: "pink", label: "Розовый", hex: "#ec4899" },
  { id: "red", label: "Красный", hex: "#ef4444" },
  { id: "cyan", label: "Бирюзовый", hex: "#06b6d4" },
] as const;

export type AccentId = (typeof ACCENT_PRESETS)[number]["id"];

export const DEFAULT_ACCENT: AccentId = "blue";

export function accentHex(id: string | null | undefined): string {
  const found = ACCENT_PRESETS.find((p) => p.id === id);
  return found?.hex ?? ACCENT_PRESETS[0].hex;
}

export function isAccentId(value: string): value is AccentId {
  return ACCENT_PRESETS.some((p) => p.id === value);
}

/** Darken hex ~12% for hover (no color-mix needed on the property itself). */
export function accentHoverHex(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.max(0, Math.round(((n >> 16) & 255) * 0.88));
  const g = Math.max(0, Math.round(((n >> 8) & 255) * 0.88));
  const b = Math.max(0, Math.round((n & 255) * 0.88));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export function applyAccentToDocument(hex: string): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement.style;
  root.setProperty("--app-accent", hex);
  root.setProperty("--app-accent-hover", accentHoverHex(hex));
  root.setProperty("--app-accent-soft", `color-mix(in srgb, ${hex} 14%, transparent)`);
  root.setProperty("--app-accent-muted", `color-mix(in srgb, ${hex} 28%, transparent)`);
  root.setProperty("--app-accent-ring", `color-mix(in srgb, ${hex} 35%, transparent)`);
}
