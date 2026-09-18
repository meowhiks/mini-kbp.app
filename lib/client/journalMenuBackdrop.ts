/** Фон при открытии меню ячейки журнала. */
export type JournalMenuBackdrop = "blur" | "dim" | "off";

export const JOURNAL_MENU_BACKDROP_DEFAULT: JournalMenuBackdrop = "blur";

export function parseJournalMenuBackdrop(value: unknown): JournalMenuBackdrop {
  if (value === "blur" || value === "dim" || value === "off") return value;
  return JOURNAL_MENU_BACKDROP_DEFAULT;
}

export const JOURNAL_MENU_BACKDROP_OPTIONS: {
  id: JournalMenuBackdrop;
  label: string;
  hint: string;
}[] = [
  { id: "blur", label: "Размытие", hint: "Остальное заблюрено" },
  { id: "dim", label: "Затемнение", hint: "Как раньше, тёмный фон" },
  { id: "off", label: "Выкл.", hint: "Только обводка ячейки" },
];
