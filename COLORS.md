# COLORS.md — MiniKBP Timetable (fork)

Палитра, темы и типографика UI. Источники: `app/globals.css`, `lib/client/appTheme.ts`, `app/layout.tsx`.

В этом форке журнал из навигации убран; CSS-токены `--app-journal-*` могут оставаться в теме для совместимости.

---

## Brand / accent

| Роль | Hex | Где |
|------|-----|-----|
| Accent (default) | `#3390ec` | `--app-accent`, кнопки, ссылки, активная вкладка |
| Accent presets | blue / green / purple / orange / pink / red / cyan | Settings → Оформление → `app_settings_v1.accentColor` |
| Accent hover | `color-mix` / `#2d7fd6` | primary buttons |
| Accent OLED fallback | `#5eb0ff` | theme token when OLED (overridden by user accent) |
| Timetable entity hover (light) | `#2563eb` | `.tt-entity-link:hover` |
| Focus ring | `var(--app-accent)` @ 20–30% | inputs |
| Settings light surface | `#ffffff` | App page / shell background |
| Dark base | `#141414` | black @ ~8% lightness |

User accent is applied at runtime via `document.documentElement.style.setProperty("--app-accent", hex)`.

---

## Themes (CSS variables)

### Light (`:root`)

| Token | Value |
|-------|-------|
| `--app-bg` | `#ffffff` |
| `--app-surface` | `#ffffff` |
| `--app-elevated` | `#ffffff` |
| `--app-border` | `#e5e7eb` |
| `--app-muted` | `#6b7280` |
| `--app-accent` | `#3390ec` (runtime override) |
| `--app-accent-hover` / `--app-accent-soft` / `--app-accent-muted` / `--app-accent-ring` | derived from accent |
| `--tt-pc-bg` | `#f3f4f6` |
| `--tt-pc-surface` | `#f9fafb` |
| `--tt-pc-cell` | `#ffffff` |
| `--tt-pc-line` | `#eceef1` |
| `--tt-pc-border` | `#e5e7eb` |
| `--tt-pc-today-bg` | `#eff6ff` |
| `--tt-pc-today-text` | `#1e3a8a` |
| `--app-journal-cell` | `#fefce8` |
| `--app-journal-header` | `#f9fafb` |
| `--app-journal-sticky` | `#ffffff` |
| `--app-journal-month` | `#f3f4f6` |
| `--app-journal-selected` | `#f3f4f6` |
| `--app-journal-saved` | `#ecfccb` |
| `--app-journal-border` | `#e5e7eb` |
| `--app-journal-text` | `#111827` |
| `--app-journal-text-muted` | `#4b5563` |
| `--app-journal-text-header` | `#374151` |

Tailwind shell (light): page / shell `bg-white`, nav `bg-white border-gray-200`.

### Dark (`html.dark`, not OLED)

| Token | Value |
|-------|-------|
| `--app-bg` | `#141414` (black @ ~8% lightness) |
| `--app-surface` | `#1a1a1a` |
| `--app-elevated` | `#242424` |
| `--app-border` | `rgba(255,255,255,0.12)` |
| `--app-muted` | `#b3b3b3` |
| `--app-accent` | runtime / `#3390ec` |
| `--app-journal-cell` / header / sticky / month | `#12151a` |
| `--app-journal-selected` | `#181c23` |
| `--app-journal-saved` | `#14532d` |
| `--app-journal-border` | `rgba(255,255,255,0.08)` |
| `--app-journal-text` | `#edf0f5` |
| `--app-journal-text-muted` | `#9aa3b2` |
| `--app-journal-text-header` | `#dfe3ea` |

Shell: `bg-[var(--app-bg)] text-zinc-100`.

### OLED (`html.dark.theme-oled`)

| Token | Value |
|-------|-------|
| `--app-bg` / `--app-surface` | `#000000` |
| `--app-elevated` | `#0a0a0a` |
| `--app-border` | `#1a1a1a` |
| `--app-muted` | `#71717a` |
| `--app-accent` | `#5eb0ff` |
| journal surfaces | mostly `#000000` / selected `#0a0a0a` |
| `--app-journal-saved` | `#052e16` |
| `--app-journal-text` | `#f4f4f5` |
| `--app-journal-text-muted` | `#a1a1aa` |
| `--app-journal-text-header` | `#e4e4e7` |

Shell / nav: pure black; active nav text `#5eb0ff`.

---

## Surfaces & UI chrome (hardcoded)

| Элемент | Light | Dark / OLED |
|---------|-------|-------------|
| Input fill | `#f0f0f0` | zinc / white alpha |
| Staff panel bg | `#f7f8fa` | — |
| Auth input | `#f0f0f0` | zinc-900-ish |
| Document `--background` / `--foreground` | `#ffffff` / `#171717` | (theme via `.dark`) |
| Viewport `themeColor` | `#ffffff` | |

Radius: inputs/buttons mostly `rounded-xl` (12px) / `rounded-2xl` (16px).  
Cards: `rounded-2xl`.

---

## Typography

Google fonts (`app/layout.tsx`):

| Font | CSS variable | Weights | Role |
|------|--------------|---------|------|
| **Manrope** | `--font-manrope` | 400–800 | основной UI (`--font-sans`) |
| **Comfortaa** | `--font-comfortaa` | 400–700 | акцентные заголовки / бренд |
| **Montserrat** | `--font-montserrat` | 600–900 | тяжёлые display-заголовки |

Типичные размеры UI:

- Auth title: `text-3xl font-bold`
- Body / inputs: `text-[15px]`
- Secondary: `text-sm` / `text-[13px]`
- Settings hub titles: `text-[22px] font-bold`

Подмножества: `latin` + `cyrillic`.

---

## Motion (кратко)

- Timetable day slide: ~0.38s `cubic-bezier(0.22, 0.9, 0.2, 1)`
- Fade-in / load slide: 0.2–0.4s
- Shimmer / loader bars: см. `globals.css` keyframes

---

## Как применять тему в коде

```ts
import { applyAppThemeToDocument, themePageBg, type AppTheme } from "@/lib/client/appTheme";

applyAppThemeToDocument("dark"); // html.dark
applyAppThemeToDocument("oled"); // html.dark + html.theme-oled
```

Хранение: `app_settings_v1.theme` ∈ `light` | `dark` | `oled`.
