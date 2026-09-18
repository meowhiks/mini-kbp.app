"""Vision OCR адаптер для листов замен."""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

import urllib.error
import urllib.request

logger = logging.getLogger(__name__)

VISION_PROMPT = """Ты читаешь фото бумажного листа замен расписания колледжа (русский).
Верни ТОЛЬКО JSON без markdown.
В строке листа читай ТОЛЬКО первую часть — что СТАВИМ: группа | № урока | предмет | аудитория | преподаватель.
Вторую часть («что было») НЕ читай.
{
  "schedule_info": {"day_of_week": "...", "date": "DD.MM.YY или как на листе", "signed_by": "..."},
  "replacements": [
    {
      "group_code": "491П",
      "lesson_number": "7" или "9-10",
      "subject": "...",
      "room": "...",
      "teachers": ["..."]
    }
  ]
}
Правила:
- Галочки (√, V, ✓) → строка "√", не раскрывай.
- «Урок снят» → subject "Урок снят".
- Не выдумывай строки. Поля original_data не добавляй.
"""


def vision_configured() -> bool:
    return bool((os.environ.get("REPLACEMENT_VISION_API_KEY") or "").strip())


def _extract_json(text: str) -> dict[str, Any]:
    text = (text or "").strip()
    if not text:
        return {}
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            try:
                data = json.loads(text[start : end + 1])
                return data if isinstance(data, dict) else {}
            except json.JSONDecodeError:
                return {}
        return {}


def run_vision_ocr(image_bytes: bytes, *, content_type: str = "image/jpeg") -> dict[str, Any]:
    """Вызов OpenAI-compatible chat/completions с image. Без ключа — ValueError."""
    api_key = (os.environ.get("REPLACEMENT_VISION_API_KEY") or "").strip()
    if not api_key:
        raise ValueError("REPLACEMENT_VISION_API_KEY not configured")

    base = (os.environ.get("REPLACEMENT_VISION_API_URL") or "https://api.openai.com/v1").rstrip("/")
    model = (os.environ.get("REPLACEMENT_VISION_MODEL") or "gpt-4o-mini").strip()

    import base64

    b64 = base64.b64encode(image_bytes).decode("ascii")
    mime = content_type if content_type.startswith("image/") else "image/jpeg"
    data_url = f"data:{mime};base64,{b64}"

    body = {
        "model": model,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": VISION_PROMPT},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            }
        ],
    }
    req = urllib.request.Request(
        f"{base}/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        err_body = exc.read().decode("utf-8", errors="replace")[:500]
        logger.warning("Vision OCR HTTP %s: %s", exc.code, err_body)
        raise RuntimeError(f"Vision API error {exc.code}") from exc
    except Exception as exc:
        logger.warning("Vision OCR failed: %s", exc)
        raise RuntimeError("Vision API request failed") from exc

    try:
        content = raw["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError("Vision API returned unexpected payload") from exc

    return _extract_json(content if isinstance(content, str) else json.dumps(content))
