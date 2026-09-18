# Firebase для push (FCM)

1. Firebase Console → проект **mini-kbp** → Project settings → Your apps → **Add Android app**
   - Package name: `com.kbp.journal`
2. Скачай `google-services.json` и положи сюда: `android/app/google-services.json`
3. Пересобери APK: `npm run build:android`

Без этого файла FCM-токен не выдаётся, но локальные уведомления работают.
