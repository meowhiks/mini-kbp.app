# Android — Capacitor (WebView)

Приложение загружает UI из статического экспорта Next.js (`out/`) внутри WebView. Нативный Java-код — только плагины (уведомления, фоновая синхронизация).

## Сборка APK

```powershell
npm run build:android
# = build-mobile.js (next export) + npx cap sync + можно собрать gradle:
cd android
.\gradlew.bat assembleDebug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`

Release:

```powershell
cd android
.\gradlew.bat assembleRelease
```

Live reload (UI с dev-сервера):

```powershell
$env:CAP_SERVER_URL="http://192.168.x.x:3000"
npm run build:android
```

## Архитектура

| Компонент | Назначение |
|-----------|------------|
| `MainActivity` | Capacitor `BridgeActivity` + `NotificationPlugin` |
| `out/` | Статический экспорт `/app`, `/app/journal`, … |
| `lib/client/*` | Тот же код, что и веб-ЛК |
| `NotificationPlugin` | WorkManager, локальные уведомления |

## Вход через сайт

В Capacitor-приложении кнопка **«Войти используя сайт»** → Chrome → polling → JWT в `@capacitor/preferences`.

## Legacy native (Java UI)

Старый полностью нативный APK (без WebView):

```powershell
npm run build:android:native
```

Исходники нативных экранов перенесены в `android/native-legacy/java/` и **не компилируются** в Capacitor-сборке (только `MainActivity`, `NotificationPlugin`, WorkManager).

## Сервер

```powershell
docker compose build api && docker compose up -d api
```
