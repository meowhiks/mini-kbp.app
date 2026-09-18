"""Валидация полей профиля ЛК."""

from __future__ import annotations

import base64
import re
from urllib.parse import urlparse

_NAME_RE = re.compile(r"^[^\W\d_]+(?:[ \-'.][^\W\d_]+)*$", re.UNICODE)
_PHONE_RE = re.compile(r"^\+?[0-9][0-9\s\-()]{5,24}$")
_HTML_RE = re.compile(r"[<>]")
_ALLOWED_DATA_TYPES = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/jpg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/gif": (b"GIF87a", b"GIF89a"),
    "image/webp": (b"RIFF",),
}


def display_name_error(value: str) -> str | None:
    raw = (value or "").strip()
    if not raw:
        return None
    if len(raw) > 255:
        return "Слишком длинное имя"
    if not _NAME_RE.fullmatch(raw):
        return "Имя: только буквы, пробел, дефис и апостроф"
    return None


def phone_error(value: str) -> str | None:
    raw = (value or "").strip()
    if not raw:
        return None
    if not _PHONE_RE.fullmatch(raw):
        return "Укажите телефон в формате +375…"
    return None


def info_error(value: str) -> str | None:
    raw = value or ""
    if len(raw) > 2000:
        return "Слишком длинный текст «о себе»"
    if _HTML_RE.search(raw):
        return "В поле «о себе» нельзя вставлять HTML"
    return None


def avatar_url_error(value: str) -> str | None:
    raw = (value or "").strip()
    if not raw:
        return None
    if len(raw) > 500_000:
        return "Аватар слишком большой"
    if raw.lower().startswith("javascript:"):
        return "Недопустимый адрес фото"
    if raw.startswith("https://"):
        host = urlparse(raw).hostname or ""
        if not host:
            return "Недопустимый адрес фото"
        return None
    if raw.startswith("http://"):
        return "Фото по ссылке только через https"
    if not raw.startswith("data:"):
        return "Можно загрузить только изображение"
    header, _, b64 = raw.partition(",")
    mime = header[5:].split(";")[0].strip().lower()
    if mime not in _ALLOWED_DATA_TYPES:
        return "Фото: JPEG, PNG, GIF или WebP"
    try:
        blob = base64.b64decode(b64, validate=False)
    except Exception:
        return "Не удалось прочитать файл фото"
    if not blob:
        return "Пустой файл фото"
    prefixes = _ALLOWED_DATA_TYPES[mime]
    if mime == "image/webp":
        if not (blob.startswith(b"RIFF") and b"WEBP" in blob[:16]):
            return "Файл не похож на изображение"
        return None
    if not any(blob.startswith(p) for p in prefixes):
        return "Файл не похож на изображение"
    return None
