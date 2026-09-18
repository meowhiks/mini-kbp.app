/** Раскладка отметок в ячейке журнала (студент / учитель). */

export type CellMark = { value?: string };

/** Сколько отметок рисуем и нужен ли «…». */
export function cellMarkSlice<T>(marks: T[]): { visible: T[]; showEllipsis: boolean } {
  if (marks.length <= 4) return { visible: marks.slice(0, 4), showEllipsis: false };
  return { visible: marks.slice(0, 3), showEllipsis: true };
}

/** Размер шрифта: пропорционально числу символов и количеству отметок в ячейке. */
export function cellMarkFontPx(
  value: string,
  marksInCell: number,
  scalePercent = 100,
  dense = false
): number {
  const len = value.trim().length;
  const scale = scalePercent / 100;
  let base: number;
  if (marksInCell <= 1) {
    if (len <= 1) base = dense ? 11 : 13;
    else if (len === 2) base = dense ? 10 : 11;
    else base = dense ? 8 : 9;
  } else if (marksInCell === 2) {
    base = len <= 1 ? (dense ? 10 : 11) : dense ? 8 : 9;
  } else if (marksInCell === 3) {
    base = len <= 2 ? (dense ? 8 : 9) : 8;
  } else {
    base = 7;
  }
  return Math.max(7, Math.round(base * scale));
}
