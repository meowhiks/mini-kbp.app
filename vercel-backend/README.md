# Mini KBP — Vercel push backend

Бесплатный стек: **Firestore + FCM** (Firebase Spark), **Vercel** (serverless), **cron-job.org** (триггер каждые 5 мин).

Парсит расписание групп с `kbp.by`, сравнивает с прошлым снимком в Firestore, шлёт push подписчикам.

## Структура

| Путь | Назначение |
|------|------------|
| `api/parse.js` | Cron: парсинг всех групп из Firestore |
| `api/register.js` | Регистрация FCM-токена телефона + группы |
| `api/health.js` | Проверка, что деплой жив |
| `lib/parseTimetable.mjs` | Парсер HTML (как в `lib/client/kbpApi.ts`) |
| `lib/parseJob.mjs` | Оркестрация: fetch → diff → FCM |

## Firestore

### `subscriptions/{deviceId}`

```json
{
  "fcmToken": "...",
  "ejGroupId": "42",
  "groupName": "ИС-31",
  "notifyTimetable": true,
  "notifyJournal": false,
  "active": true
}
```

Создаётся через `POST /api/register` из приложения после входа.

### `monitored_groups/{ejGroupId}`

```json
{
  "ejGroupId": "42",
  "groupName": "ИС-31",
  "kbpTimetableId": "123",
  "enabled": true,
  "fingerprint": "...",
  "lastTimetable": { "pairs": [] },
  "lastParsedAt": "2026-06-09T12:00:00.000Z"
}
```

Заполняется автоматически парсером. Можно добавить группу вручную в консоли Firebase.

## Деплой на Vercel

1. Установи [Vercel CLI](https://vercel.com/cli) или подключи репозиторий.
2. **Root Directory** проекта на Vercel: `vercel-backend`.
3. Environment Variables:
   - `CRON_SECRET` — длинная случайная строка для cron-job.org
   - `FIREBASE_SERVICE_ACCOUNT_JSON` — **весь** JSON из `mini-kbp-firebase-adminsdk-....json` **одной строкой** (без переносов или с `\n` в private_key)

```bash
cd vercel-backend
npm install
vercel
```

Локально: скопируй `.env.example` → `.env.local` (Vercel подхватывает при `vercel dev`).

**Не коммить** файл service account в git.

## Cron-job.org

- URL: `https://ВАШ-ПРОЕКТ.vercel.app/api/parse?secret=ВАШ_CRON_SECRET`  
  (без `?secret=` cron получит 401)
- Интервал: **каждые 5 минут**
- Метод: GET

## API

### `GET /api/parse?secret=...`

Запускает парсинг. Ответ — JSON со статистикой по группам.

### `POST /api/register`

```json
{
  "fcmToken": "firebase-fcm-token",
  "ejGroupId": "42",
  "groupName": "ИС-31",
  "notifyTimetable": true
}
```

### `GET /api/health`

Проверка деплоя.

## Firebase Console

1. Включить **Firestore** (режим production, регион ближе к BY — например `europe-west1`).
2. Включить **Cloud Messaging** (FCM).
3. Правила Firestore (минимум для сервера — только Admin SDK; клиенту позже отдельные rules):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

Серверный SDK обходит rules — это нормально.

## Связка с Android-приложением

После входа в журнал приложение должно:

1. Получить FCM token (`FirebaseMessaging.getInstance().getToken()`).
2. Вызвать `POST /api/register` с `ejGroupId`, `groupName` из сессии.

Журнал через ej (оценки) в этом бэкенде **пока не парсится** — только **расписание и замены** по группе на kbp.by.
