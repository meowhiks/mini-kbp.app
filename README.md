# Мини КБиП — приложение (Android)

Мобильный клиент расписания [Колледжа бизнеса и права](https://kbp.by): группы, преподаватели, аудитории и предметы без входа и без журнала.

Приложение ходит напрямую на `kbp.by` через Capacitor HTTP, кэширует недели локально, умеет поиск, свободные аудитории, архив прошлых недель, акценты темы и уведомления о заменах. UI — WebView со статикой из `out/`.

Сайт / веб: [mini-kbp.site](https://mini-kbp.site)

---

## Стек

<p>
  <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js"></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React"></a>
  <a href="https://capacitorjs.com/"><img src="https://img.shields.io/badge/Capacitor-8-119EFF?style=for-the-badge&logo=capacitor&logoColor=white" alt="Capacitor"></a>
  <a href="https://developer.android.com/"><img src="https://img.shields.io/badge/Android-APK-3DDC84?style=for-the-badge&logo=android&logoColor=white" alt="Android"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"></a>
</p>

Next.js (`output: 'export'`) → статика в `out/` → Capacitor sync → Android WebView. Версия клиента: **0.3.22**.

---

## Android

Нужны Node.js 20+, Android SDK (`ANDROID_HOME`) и устройство/эмулятор с USB-отладкой.

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
export PATH="$ANDROID_HOME/platform-tools:$PATH"

npm ci
npm run build:mobile          # UI → out/ + cap sync
npm run android:run           # debug APK + adb install
```

По шагам:

```bash
npm run build:android:native  # → android/app/build/outputs/apk/debug/app-debug.apk
npm run android:install
```

Live reload (опционально): `CAP_SERVER_URL=http://192.168.x.x:3000 npm run build:mobile`.

---

## Возможности

| | |
|---|---|
| Расписание | текущая неделя, свайп дней, замены |
| Поиск | группа / преподаватель / аудитория / предмет |
| Офлайн | кэш и архив прошлых недель |
| Свободные аудитории | по текущей паре |
| Тема | светлая / тёмная, акценты |
| Уведомления | локальные пинги о заменах |

---

## Релизы

Актуальный APK: [Releases](https://github.com/meowhiks/mini-kbp.app/releases)

| Версия | Скачать |
|--------|---------|
| **0.3.22** | [mini-kbp-0.3.22.apk](https://github.com/meowhiks/mini-kbp.app/releases/download/v0.3.22/mini-kbp-0.3.22.apk) |
