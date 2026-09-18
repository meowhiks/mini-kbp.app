export type NamedGroup = { id: number; name: string };

export type CuratorLink = { teacher: number; group: number };

export function curatorOwnedGroups<T extends NamedGroup>(
  groups: T[],
  curators: CuratorLink[],
  teacherId: number | undefined
): T[] {
  if (!teacherId) return [];
  const allowed = new Set(
    curators.filter((c) => c.teacher === teacherId).map((c) => c.group)
  );
  return groups.filter((g) => allowed.has(g.id));
}
