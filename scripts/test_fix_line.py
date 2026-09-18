from pathlib import Path

line = Path("app/app/journal/page.tsx").read_bytes().split(b"\n")[538]
print(line.decode("utf-8", errors="replace")[:200])
