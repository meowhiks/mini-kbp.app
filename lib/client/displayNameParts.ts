export type DisplayNameParts = {
  lastName: string;
  firstName: string;
  patronymic: string;
};

/** «Фамилия Имя Отчество» → три поля */
export function parseDisplayName(displayName: string): DisplayNameParts {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { lastName: "", firstName: "", patronymic: "" };
  if (parts.length === 1) return { lastName: "", firstName: parts[0], patronymic: "" };
  if (parts.length === 2) return { lastName: parts[0], firstName: parts[1], patronymic: "" };
  return { lastName: parts[0], firstName: parts[1], patronymic: parts.slice(2).join(" ") };
}

export function composeDisplayName(parts: DisplayNameParts): string {
  return [parts.lastName, parts.firstName, parts.patronymic]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
}

export function displayNameLabel(displayName: string, fallback = "Без имени"): string {
  const s = displayName.trim();
  return s || fallback;
}

export function displayNameInitial(displayName: string, email = "", fallback = "?"): string {
  const parts = parseDisplayName(displayName);
  const src = parts.firstName || parts.lastName || displayName || email || fallback;
  return src.charAt(0).toUpperCase();
}

/** «Иванов Иван Иванович» → «Иванов И.И.» */
export function formatStudentShortName(fullName: string): string {
  const { lastName, firstName, patronymic } = parseDisplayName(fullName);
  const surname = lastName || firstName || fullName.trim();
  if (!firstName && !patronymic) return surname;
  const firstInit = firstName ? `${firstName.charAt(0).toUpperCase()}.` : "";
  const patInit = patronymic ? `${patronymic.charAt(0).toUpperCase()}.` : "";
  const initials = [firstInit, patInit].filter(Boolean).join("");
  return initials ? `${surname} ${initials}` : surname;
}
