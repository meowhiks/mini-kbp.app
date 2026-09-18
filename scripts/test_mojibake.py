import re
from pathlib import Path

path = Path("app/app/journal/page.tsx")
t = path.read_text(encoding="utf-8")
m = re.search(r'surnamePart[^"]+"([^"]+)"', t)
s = m.group(1)
print("broken:", s)
for enc in ["latin-1", "cp1251", "cp1252", "iso-8859-1"]:
    try:
        fixed = s.encode(enc).decode("utf-8")
        print(enc, "->", fixed)
    except Exception as e:
        print(enc, "ERR", e)

try:
    import ftfy

    print("ftfy", ftfy.fix_text(s))
except ImportError:
    print("no ftfy")
