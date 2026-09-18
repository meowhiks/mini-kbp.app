/** Нижняя навигация ЛК: у администрации добавляется переход в панель. */

export type AppNavItem =
  | { kind: "tab"; id: number; label: string; icon: "settings" | "calendar" | "journal" | "profile" }
  | { kind: "panel"; label: string; icon: "panel" };

const BASE_TABS: Extract<AppNavItem, { kind: "tab" }>[] = [
  { kind: "tab", id: 0, label: "Настройки", icon: "settings" },
  { kind: "tab", id: 1, label: "Расписание", icon: "calendar" },
];

export function appNavItems(
  staffRole: string | null | undefined,
  opts?: { hideAdminPanel?: boolean; guestMode?: boolean }
): AppNavItem[] {
  if (opts?.guestMode) {
    return BASE_TABS.filter((item) => item.id === 0 || item.id === 1);
  }
  if (staffRole !== "admin" || opts?.hideAdminPanel) return BASE_TABS;
  return [
    ...BASE_TABS,
    { kind: "panel", label: "Панель администратора", icon: "panel" },
  ];
}
