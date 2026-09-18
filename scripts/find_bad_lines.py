from pathlib import Path

t = Path("app/app/journal/page.tsx").read_text(encoding="utf-8")
# Mojibake marker: Cyrillic Р (U+0420) followed by another Cyrillic cap in weird combo
bad = [i + 1 for i, line in enumerate(t.splitlines()) if "\u0420\u0459" in line or "Рќ" in line]
print("lines with mojibake marker:", len(bad))
for n in bad[:15]:
    print(n, repr(t.splitlines()[n - 1][:90]))
