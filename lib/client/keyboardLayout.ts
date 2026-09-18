/**
 * QWERTY ↔ ЙЦУКЕН: поиск при случайной раскладке.
 * Maps physical key positions between English and Russian layouts.
 */

const EN_TO_RU: Record<string, string> = {
  q: "й",
  w: "ц",
  e: "у",
  r: "к",
  t: "е",
  y: "н",
  u: "г",
  i: "ш",
  o: "щ",
  p: "з",
  "[": "х",
  "]": "ъ",
  a: "ф",
  s: "ы",
  d: "в",
  f: "а",
  g: "п",
  h: "р",
  j: "о",
  k: "л",
  l: "д",
  ";": "ж",
  "'": "э",
  z: "я",
  x: "ч",
  c: "с",
  v: "м",
  b: "и",
  n: "т",
  m: "ь",
  ",": "б",
  ".": "ю",
  "`": "ё",
};

const RU_TO_EN: Record<string, string> = Object.fromEntries(
  Object.entries(EN_TO_RU).map(([en, ru]) => [ru, en])
);

function mapChars(input: string, table: Record<string, string>): string {
  let out = "";
  for (const ch of input) {
    const lower = ch.toLowerCase();
    const mapped = table[lower];
    if (!mapped) {
      out += ch;
      continue;
    }
    out += ch === lower ? mapped : mapped.toUpperCase();
  }
  return out;
}

/** Convert text typed as if on the other layout. */
export function swapKeyboardLayout(value: string): string {
  if (!value) return value;
  const hasCyrillic = /[а-яёА-ЯЁ]/.test(value);
  const hasLatin = /[a-zA-Z]/.test(value);
  if (hasCyrillic && !hasLatin) return mapChars(value, RU_TO_EN);
  if (hasLatin && !hasCyrillic) return mapChars(value, EN_TO_RU);
  // Mixed: try both directions on latin/cyrillic chars only
  return mapChars(mapChars(value, EN_TO_RU), RU_TO_EN) === value
    ? mapChars(value, EN_TO_RU)
    : mapChars(value, RU_TO_EN);
}

/** Unique query variants to try in search (original + swapped layout). */
export function searchQueryVariants(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const swapped = swapKeyboardLayout(trimmed);
  if (swapped === trimmed) return [trimmed];
  return [trimmed, swapped];
}
