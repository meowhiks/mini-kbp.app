# Native-first auth — Android Java

Нативное приложение (`android/`) **не использует Capacitor**.

## Вход

| Способ | Экран | API |
|--------|-------|-----|
| Email + пароль | `AuthActivity` | `POST /api/auth/app/login/` |
| Google / Telegram | `AuthActivity` → Chrome | mobile link start + poll |

OAuth: браузер открывается через `Intent.ACTION_VIEW`, приложение ждёт polling на сервере.

## Сборка

```powershell
npm run build:android
```

Подробнее: [docs/android-native.md](./android-native.md)

Старый Capacitor WebView:

```powershell
npm run build:android:capacitor
```
