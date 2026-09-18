#!/usr/bin/env python3
"""Regenerate Android adaptive launcher icons from public/minikbp.png.

- Foreground: crest scaled into ~62/108 safe zone, transparent outside
- Monochrome: binary white silhouette of crest details (no white disk fill)
- Background: solid white

Writes mipmap-* webp assets, mipmap-anydpi-v26 adaptive XML, and
resources/android/{icon-foreground,icon-monochrome,icon-background}.png
for optional @capacitor/assets workflows.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "minikbp.png"
SAFE_RATIO = 62 / 108
SIZES = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
LEGACY = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
ADAPTIVE_XML = """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
"""


def punch_black(im: Image.Image, thr: int = 22) -> Image.Image:
  out = Image.new("RGBA", im.size, (0, 0, 0, 0))
  sp, op = im.load(), out.load()
  w, h = im.size
  for y in range(h):
    for x in range(w):
      r, g, b, a = sp[x, y]
      if a < 8:
        continue
      if r <= thr and g <= thr and b <= thr:
        continue
      op[x, y] = (r, g, b, a)
  return out


def content_bbox(im: Image.Image) -> tuple[int, int, int, int]:
  px = im.load()
  w, h = im.size
  xs: list[int] = []
  ys: list[int] = []
  for y in range(h):
    for x in range(w):
      if px[x, y][3] > 8:
        xs.append(x)
        ys.append(y)
  if not xs:
    return (0, 0, w, h)
  return (min(xs), min(ys), max(xs) + 1, max(ys) + 1)


def fit_in_safe(logo: Image.Image, canvas: int) -> Image.Image:
  safe = int(round(canvas * SAFE_RATIO))
  lw, lh = logo.size
  scale = min(safe / lw, safe / lh)
  nw, nh = max(1, int(lw * scale)), max(1, int(lh * scale))
  resized = logo.resize((nw, nh), Image.Resampling.LANCZOS)
  out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
  out.alpha_composite(resized, ((canvas - nw) // 2, (canvas - nh) // 2))
  return out


def to_detail_mono(
  im: Image.Image, white_thr: int = 230, alpha_thr: int = 40
) -> Image.Image:
  out = Image.new("RGBA", im.size, (0, 0, 0, 0))
  sp, op = im.load(), out.load()
  w, h = im.size
  for y in range(h):
    for x in range(w):
      r, g, b, a = sp[x, y]
      if a < alpha_thr:
        continue
      if r >= white_thr and g >= white_thr and b >= white_thr:
        continue
      op[x, y] = (255, 255, 255, 255)
  return out


def main() -> None:
  if not SOURCE.exists():
    raise SystemExit(f"missing source icon: {SOURCE}")

  crest = punch_black(Image.open(SOURCE).convert("RGBA"))
  crest = crest.crop(content_bbox(crest))

  res = ROOT / "resources" / "android"
  res.mkdir(parents=True, exist_ok=True)
  fg1024 = fit_in_safe(crest, 1024)
  mono1024 = to_detail_mono(fg1024)
  fg1024.save(res / "icon-foreground.png")
  mono1024.save(res / "icon-monochrome.png")
  Image.new("RGB", (1024, 1024), (255, 255, 255)).save(res / "icon-background.png")
  full = Image.new("RGBA", (1024, 1024), (255, 255, 255, 255))
  full.alpha_composite(fg1024)
  (ROOT / "resources").mkdir(parents=True, exist_ok=True)
  full.convert("RGB").save(ROOT / "resources" / "icon.png")

  for dens, canvas in SIZES.items():
    d = ROOT / "android" / "app" / "src" / "main" / "res" / f"mipmap-{dens}"
    d.mkdir(parents=True, exist_ok=True)
    fg = fit_in_safe(crest, canvas)
    mono = to_detail_mono(fg)
    fg.save(d / "ic_launcher_foreground.webp", "WEBP", lossless=True)
    mono.save(d / "ic_launcher_monochrome.webp", "WEBP", lossless=True)
    Image.new("RGBA", (canvas, canvas), (255, 255, 255, 255)).save(
      d / "ic_launcher_background.webp", "WEBP", lossless=True
    )
    leg = LEGACY[dens]
    composed = Image.new("RGBA", (canvas, canvas), (255, 255, 255, 255))
    composed.alpha_composite(fg)
    legacy = composed.resize((leg, leg), Image.Resampling.LANCZOS)
    legacy.save(d / "ic_launcher.webp", "WEBP", lossless=True)
    legacy.save(d / "ic_launcher_round.webp", "WEBP", lossless=True)

  anydpi = ROOT / "android" / "app" / "src" / "main" / "res" / "mipmap-anydpi-v26"
  anydpi.mkdir(parents=True, exist_ok=True)
  (anydpi / "ic_launcher.xml").write_text(ADAPTIVE_XML)
  (anydpi / "ic_launcher_round.xml").write_text(ADAPTIVE_XML)
  print("Android launcher icons regenerated.")


if __name__ == "__main__":
  main()
