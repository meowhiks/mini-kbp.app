from pathlib import Path

t = Path("app/app/journal/page.tsx").read_text(encoding="utf-8")
needles = [
    "Настройки",
    "РќР°СЃС‚СЂРѕР№РєРё",
    "Студент",
    "РЎС‚СѓРґРµРЅС‚",
    "Сервер push",
    "РЎРµСЂРІРµСЂ push",
    "Vercel",
]
for n in needles:
    print(f"{n!r}: {n in t}")

# count lines with mojibake pattern (Рќ or РЎ as start of word in string)
import re

bad_lines = []
for i, line in enumerate(t.splitlines(), 1):
    if "Рќ" in line or "РЎ" in line and "РЎС‚" in line:
        bad_lines.append((i, line.strip()[:100]))
print(f"bad lines: {len(bad_lines)}")
for i, ln in bad_lines[:8]:
    print(i, ln)
