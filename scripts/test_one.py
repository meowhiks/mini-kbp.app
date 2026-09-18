from pathlib import Path

lines = Path("app/app/journal/page.tsx").read_text(encoding="utf-8", errors="replace").splitlines()
s = lines[538].split('"')[1]
Path("scripts/sample.txt").write_text(repr(s) + "\n", encoding="utf-8")
for enc in ("latin-1", "cp1251", "cp1252", "mac_cyrillic"):
    try:
        fixed = s.encode(enc).decode("utf-8")
        Path("scripts/sample.txt").write_text(Path("scripts/sample.txt").read_text() + f"{enc}: {fixed}\n", encoding="utf-8")
    except Exception as e:
        Path("scripts/sample.txt").write_text(Path("scripts/sample.txt").read_text() + f"{enc}: ERR {e}\n", encoding="utf-8")
