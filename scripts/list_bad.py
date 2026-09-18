from pathlib import Path

lines = Path("app/app/journal/page.tsx").read_text(encoding="utf-8", errors="replace").splitlines()
bad = []
for i, ln in enumerate(lines, 1):
    if "\u0098" in ln or "Рќ" in ln or "\u00a0" in ln and "ОК" in ln:
        bad.append(f"{i}: {ln}")
Path("scripts/bad_remaining.txt").write_text("\n".join(bad), encoding="utf-8")
