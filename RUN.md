# MiniKBP — быстрый старт

## Первый раз

```powershell
copy env.example .env   # отредактировать
npm install
```

## Docker (всё сразу)

```powershell
npm run docker:up          # build + up (api, web, postfix, nginx, cloudflared)
npm run docker:up:fast     # без rebuild
npm run docker:down        # остановить
docker compose ps          # статус — должно быть 5 сервисов
docker compose logs -f web # логи
```

**Сервисы:** `api` · `web` · `postfix` · `nginx` (:80) · `cloudflared` (tunnel)

**URL:** http://localhost (nginx) · API :8000 · Next :3000

### Один сервис

Не поднимай только `web`/`api` — **nginx** не стартует и сайт на :80/`lk.mini-kbp.site` отвалится. После точечного рестарта:

```powershell
docker compose up -d nginx
# или полный стек:
npm run docker:up:fast
```

```powershell
docker compose up -d api
docker compose up -d web
docker compose restart api
docker compose build --no-cache web
```

### Cloudflare tunnel (публичный домен)

`npm run docker:up` уже включает tunnel. Альтернатива:

```powershell
# 1) scripts/setup-cloudflare-tunnel.ps1
# 2)
powershell -File scripts/docker-up.ps1
```

## Без Docker (локально)

```powershell
npm run dev:server   # Django :8000
npm run dev          # Next :3000
npm run dev:lan      # Next в LAN (для телефона)
```

`.env` / `.env.local`: `NEXT_PUBLIC_MINIKBP_SERVER_URL=http://127.0.0.1:8000`

## Android / телефон

**`cap sync` не обновляет UI с веба** — копирует папку `out/`. После правок интерфейса:

```powershell
npm run build:android              # next export → out/ → cap sync
npm run cap:sync                   # только sync (если out/ уже свежий)
npm run cap:open:android           # Android Studio
npm run build:android:native       # APK debug (gradlew)
npm run build:android:native:release
```

**Live reload с ПК** (UI с dev-сервера, не из APK):

```powershell
npm run dev:lan
$env:CAP_SERVER_URL="http://192.168.x.x:3000"; npm run build:android
```

APK debug: `android/app/build/outputs/apk/debug/`

## Electron (ПК)

```powershell
npm run build:desktop   # static export → out/ (API → lk.mini-kbp.site)
npm run desktop         # окно Electron, UI из out/ (minikbp://)
```

Live reload UI с Next (опционально):

```powershell
$env:MINIKBP_DESKTOP_URL="http://127.0.0.1:3000/app"; npm run desktop
```

## Прочее

```powershell
npm run test:e2e
cd server; python manage.py test
npm run setup:hosts   # lk.mini-kbp.site → 127.0.0.1
```
