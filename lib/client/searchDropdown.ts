/** После выбора из поиска не открывать список снова, пока запрос совпадает с выбранным именем. */
export function shouldKeepSearchDropdownClosed(
  query: string,
  selectedLabel: string | null | undefined
): boolean {
  if (!selectedLabel) return false;
  return query.trim() === selectedLabel.trim();
}
