import re
from pathlib import Path

path = Path("app/app/journal/page.tsx")
text = path.read_text(encoding="utf-8", errors="replace")
out = []

def try_fix(s: str) -> str:
    if not re.search(r"[\u0400-\u04ff]", s):
        return s
    for enc in ("latin-1", "cp1251"):
        try:
            fixed = s.encode(enc).decode("utf-8")
            if fixed != s and "\ufffd" not in fixed:
                return fixed
        except Exception:
            pass
    return s

def fix_line(line: str) -> str:
    line = line.replace("СЕКЦ\u0098Я", "СЕКЦИЯ")
    line = line.replace("\u0098асписание", "Расписание")
    line = line.replace("\u0098споль", "Исполь")
    line = line.replace("ОК\u00a0", "ОКР")
    line = line.replace("ОК\u0098", "ОКР")

    def repl(m: re.Match[str]) -> str:
        inner = m.group(1)
        if len(inner) < 3:
            return m.group(0)
        fixed = try_fix(inner)
        return f'"{fixed}"'

    return re.sub(r'"((?:[^"\\]|\\.)*)"', repl, line)

fixed_lines = [fix_line(ln) for ln in text.splitlines()]
path.write_text("\n".join(fixed_lines) + "\n", encoding="utf-8")

remaining = sum(1 for ln in fixed_lines if "\u0098" in ln or "Рќ" in ln)
Path("scripts/fix_remaining.txt").write_text(str(remaining), encoding="utf-8")
