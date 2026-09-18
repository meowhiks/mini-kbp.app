#!/bin/sh
set -e

echo "[entrypoint.prod] building Next.js…"
npm run build

echo "[entrypoint.prod] starting Next.js on :3000"
exec npm run start -- -H 0.0.0.0 -p 3000
