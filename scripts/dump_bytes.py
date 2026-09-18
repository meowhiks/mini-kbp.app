from pathlib import Path

lines = Path("app/app/journal/page.tsx").read_bytes().split(b"\n")
for n in [539, 729, 1320, 1790]:
    b = lines[n - 1]
    print(n, b[60:120])
