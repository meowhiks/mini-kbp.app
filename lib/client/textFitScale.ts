/** Scale text so it stays on one line inside maxWidth. */
export function textFitScale(contentWidth: number, maxWidth: number, minScale = 0.5): number {
  if (!(maxWidth > 0) || !(contentWidth > 0)) return 1;
  if (contentWidth <= maxWidth) return 1;
  return Math.max(minScale, maxWidth / contentWidth);
}
