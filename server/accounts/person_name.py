"""Нормализация ФИО при подтверждении удаления."""


def normalize_person_name(value: str) -> str:
    return " ".join(str(value).split()).casefold()


def names_match(left: str, right: str) -> bool:
    a = normalize_person_name(left)
    b = normalize_person_name(right)
    return bool(a) and a == b
