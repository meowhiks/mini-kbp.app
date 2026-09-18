export function normalizePersonName(value: string): string {
  return value.trim().split(/\s+/).join(" ").toLocaleLowerCase();
}

export function namesMatch(left: string, right: string): boolean {
  const a = normalizePersonName(left);
  const b = normalizePersonName(right);
  return Boolean(a) && a === b;
}
