#!/bin/sh
set -e
mkdir -p /app/.next/dev/logs

# Anonymous volume node_modules часто отстаёт от package-lock после git pull
if [ ! -x node_modules/.bin/next ] || [ ! -d node_modules/@capgo/capacitor-social-login ] || [ ! -d node_modules/jsqr ]; then
  echo "[entrypoint] installing npm dependencies…"
  npm ci --prefer-offline --no-audit
fi

exec npm run dev -- -H 0.0.0.0 -p 3000
