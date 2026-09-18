export type RectLike = {
  top: number;
  left: number;
  width: number;
  height: number;
};

const GAP = 6;
const EDGE = 8;

export function placeJournalPopover(
  anchor: RectLike,
  opts: { menuWidth: number; menuHeight: number; viewport: { width: number; height: number } }
): { top: number; left: number } {
  const { menuWidth, menuHeight, viewport } = opts;
  let left = anchor.left + anchor.width / 2 - menuWidth / 2;
  left = Math.max(EDGE, Math.min(left, viewport.width - menuWidth - EDGE));

  const below = anchor.top + anchor.height + GAP;
  const above = anchor.top - GAP - menuHeight;
  const fitsBelow = below + menuHeight <= viewport.height - EDGE;
  const top = fitsBelow ? below : Math.max(EDGE, above);

  return { top, left };
}
