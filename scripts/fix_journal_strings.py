from pathlib import Path

path = Path("app/app/journal/page.tsx")
text = path.read_text(encoding="utf-8", errors="replace")

replacements = {
    "Лаб. и ОК\u0098": "Лаб. и ОКР",
    "Лаб. и ОК\u00a0": "Лаб. и ОКР",
    "ж\u0098урн": "журн",
    "СЕКЦ\u0098Я": "СЕКЦИЯ",
    "\u0098споль": "Исполь",
    "\u0098асписание": "Расписание",
    "входим\u2026": "входим…",
    "аккаунту\u2026": "аккаунту…",
}

for old, new in replacements.items():
    text = text.replace(old, new)

# Fix broken comment block before SettingsView
start = text.find("/* ")
if "SettingsView" in text:
    block_start = text.rfind("/*", 0, text.find("function SettingsView"))
    block_end = text.find("*/", block_start) + 2
    if block_start >= 0 and block_end > block_start:
        text = (
            text[:block_start]
            + "/* SettingsView — страница настроек приложения. */"
            + text[block_end:]
        )

path.write_text(text, encoding="utf-8", newline="\n")
print("fixed", path)
