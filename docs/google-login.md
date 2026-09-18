# Вход через Google (Identity Services)

## Переменные окружения

```env
GOOGLE_OAUTH_CLIENT_ID=....apps.googleusercontent.com
NEXT_PUBLIC_GOOGLE_CLIENT_ID=....apps.googleusercontent.com
```

- `GOOGLE_OAUTH_CLIENT_ID` — проверка JWT на Django API
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` — кнопка GIS в браузере

## Google Cloud Console

1. [APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
2. **Create credentials → OAuth client ID → Web application**
3. **Authorized JavaScript origins:**
   - `https://lk.mini-kbp.site`
   - `http://localhost:3000` (локальная разработка)
4. Client ID скопировать в `.env` (обе переменные)

OAuth consent screen должен быть настроен (External или Internal).

## API

`POST /api/auth/app/google/`

```json
{ "credential": "<JWT от Google Identity Services>" }
```

Ответ такой же, как у `/api/auth/app/telegram/` — токены или шаг с кодом куратора.

## Поведение аккаунта

- Новый пользователь создаётся с `google_sub`, email и аватаром из Google
- Email считается подтверждённым (`email_verified_at`)
- Если аккаунт с таким email уже есть — привязывается `google_sub`

## Docker

После изменения `.env`:

```powershell
docker compose build api web
docker compose up -d api web
```

Миграция `0008_appaccount_google_sub` применяется при старте `api`.

## Публичный конфиг

`GET /api/public/app-config/` возвращает `google_client_id` и `google_login_enabled`, если Client ID не задан в `NEXT_PUBLIC_*` на фронте.
