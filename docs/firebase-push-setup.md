# Firebase Push — настройка для MiniKBP Android

Клиент регистрирует FCM-токен (`lib/client/pushRegister.ts`) и отправляет его на **Django** (`POST /api/push/register/` через `lib/client/pushBackend.ts`).

## 1. Firebase Console

1. Создайте проект (или откройте существующий).
2. Добавьте Android-приложение с package name: **`com.kbp.journal`**.
3. Скачайте `google-services.json` → положите в [`android/app/google-services.json`](../android/app/google-services.json) (**не коммитьте** в git).
4. Включите **Cloud Messaging (FCM)**.
5. Создайте service account: Project settings → Service accounts → Generate new private key. JSON нужен на сервере Django для отправки push (если включите FCM на бэкенде).

## 2. Django (MiniKBP server)

API: [`server/`](../server/), эндпоинт `POST /api/push/register/` (модель `PushDevice`).

В `.env` / `docker-compose` для **api** и **web**:

```env
NEXT_PUBLIC_MINIKBP_SERVER_URL=http://ваш-хост:8000
```

Клиент шлёт регистрацию на `{NEXT_PUBLIC_MINIKBP_SERVER_URL}/api/push/register/`. Отдельный Vercel push-backend не используется.

Почта и прочие уведомления — через Postfix / переменные `EMAIL_*` в env (см. `env.example`).

## 3. Сборка Capacitor

```powershell
$env:CAP_SERVER_URL="https://lk.mini-kbp.site"
$env:NEXT_PUBLIC_MINIKBP_SERVER_URL="https://ваш-django-хост"
npm run build:android
npx cap open android
```

В Android Studio соберите APK/AAB. Убедитесь, что `google-services.json` на месте и плагин Google Services подключён в Gradle.

## 4. Проверка

1. Войдите в приложение на телефоне, выберите группу.
2. Включите уведомления в настройках.
3. В БД Django должна появиться запись `PushDevice` с FCM-токеном и `device_id`.
4. Расписание и push-логика завязаны на ваш Django-деплой (не ej.kbp.by для парсинга, если настроено иначе в проекте).

