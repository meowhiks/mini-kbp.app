#!/usr/bin/env python3
"""Fix UTF-8 mojibake (double-encoded Cyrillic) in source files."""
import re
import sys
from pathlib import Path


def fix_chunk(s: str) -> str:
    try:
        return s.encode("latin-1").decode("utf-8")
    except (UnicodeDecodeError, UnicodeEncodeError):
        return s


MOJIBAKE = re.compile(r"[\u0420-\u044f]{2,}")


def fix_file(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    original = text

    def repl(m: re.Match[str]) -> str:
        chunk = m.group(0)
        fixed = fix_chunk(chunk)
        return fixed if fixed != chunk and not MOJIBAKE.search(fixed) else chunk

    text = MOJIBAKE.sub(repl, text)
    if text != original:
        path.write_text(text, encoding="utf-8", newline="\n")
        return True
    return False


if __name__ == "__main__":
    targets = [Path(p) for p in sys.argv[1:]] or [Path("app/app/journal/page.tsx")]
    for t in targets:
        changed = fix_file(t)
        print(f"{'fixed' if changed else 'ok'}: {t}")
