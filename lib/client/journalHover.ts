/** Фон ячейки при наведении: строка + столбец, пересечение ярче. */
export function journalHoverCellBg(
  base: string,
  rowIdx: number | null,
  colIdx: number,
  hoverRow: number | null,
  hoverCol: number | null
): string {
  const inCol = hoverCol === colIdx;
  const inRow = rowIdx !== null && hoverRow === rowIdx;
  if (inCol && inRow) return "var(--app-journal-hover-cross)";
  if (inCol || inRow) return "var(--app-journal-hover)";
  return base;
}

export type JournalHoverState = {
  hoverRow: number | null;
  hoverCol: number | null;
};

export function journalHoverFromCell(rowIdx: number, colIdx: number): JournalHoverState {
  return { hoverRow: rowIdx, hoverCol: colIdx };
}

export function journalHoverFromColumn(colIdx: number): JournalHoverState {
  return { hoverRow: null, hoverCol: colIdx };
}

export const journalHoverClear: JournalHoverState = { hoverRow: null, hoverCol: null };
