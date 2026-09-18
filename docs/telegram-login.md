# Вход через Telegram

## Client ID — что это и где взять

**Client ID** в [oauth.telegram.org](https://oauth.telegram.org) — это **числовой ID бота**, не username.

Для `@mini_kbp_bot`:

| Поле | Значение |
|------|----------|
| Username | `mini_kbp_bot` |
| **Client ID** | **`8343745062`** |
| Токен в `.env` | `8343745062:AAF...` (число **до** двоеточия = Client ID) |

Узнать ID:

```bash
curl "https://api.telegram.org/bot<ВАШ_ТОКЕН>/getMe"
# → "id": 8343745062, "username": "mini_kbp_bot"
```

Число **`8521897198`** на скриншоте oauth.telegram.org — **другой бот**, не ваш.

## BotFather: домен и redirect (обязательно)

1. Открой [@BotFather](https://t.me/BotFather)
2. `/mybots` → **Мини КБиП** → `@mini_kbp_bot`
3. **Bot Settings** → **Web Login** (или **Domain** для legacy)
4. **Allowed URLs** — добавь:
   - `https://lk.mini-kbp.site`
   - `https://lk.mini-kbp.site/auth/telegram` (OIDC redirect для ПК)
   - `https://lk.mini-kbp.site/auth/cb/telegram` (web bridge)
   - `https://lk.mini-kbp.site/auth/cb/telegram/app` (Android Custom Tab → deep link)
5. Скопируй **Client Secret** → `TELEGRAM_OIDC_CLIENT_SECRET` в `.env`

Без домена виджет показывает **«Bot domain invalid»**.

Проверка: открой  
https://oauth.telegram.org/embed/mini_kbp_bot?origin=https%3A%2F%2Flk.mini-kbp.site&size=large  
Должна быть кнопка входа, не «Bot domain invalid».

## Где открывать сайт

| URL | Telegram |
|-----|----------|
| `https://lk.mini-kbp.site/app` | ✅ |
| `http://lk.mini-kbp.site/app` (hosts + nginx) | ✅ |
| `http://localhost:3000` | ❌ |

Локально: `.\scripts\setup-hosts.ps1`, затем **http://lk.mini-kbp.site/app** (не `:3000`).

## `.env`

```env
TELEGRAM_BOT_TOKEN=8343745062:AAF...
TELEGRAM_OIDC_CLIENT_SECRET=...   # BotFather → Web Login → Client Secret
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=mini_kbp_bot
NEXT_PUBLIC_TELEGRAM_BOT_CLIENT_ID=8343745062
APP_PUBLIC_URL=https://lk.mini-kbp.site
```

После изменений:

```bash
docker compose up -d --force-recreate api web
```

## Callback

- **Приложение (Custom Tab):** stateless OIDC → `/auth/cb/telegram?code=...` → `mobile_code` → deep link
- **ПК и телефон (браузер):** redirect OIDC (PKCE) → `/auth/telegram?code=...` → обмен на сервере
- **Legacy widget/SDK:** `#tgAuthResult=…` в hash — обрабатывается на `/app` и `/auth/telegram`

После входа Django проверяет подпись (`/api/auth/app/telegram/`).
