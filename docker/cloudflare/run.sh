#!/bin/sh
set -e

if [ -n "${TUNNEL_TOKEN:-}" ]; then
  echo "cloudflared: запуск по токену (ingress из панели Cloudflare)"
  exec cloudflared tunnel --no-autoupdate run --token "$TUNNEL_TOKEN"
fi

if [ -f /etc/cloudflared/config.yml ] && [ -f /etc/cloudflared/credentials.json ]; then
  echo "cloudflared: запуск по config.yml"
  exec cloudflared tunnel --no-autoupdate --config /etc/cloudflared/config.yml run
fi

echo "Ошибка: задайте CLOUDFLARE_TUNNEL_TOKEN в .env или положите config.yml + credentials.json в docker/cloudflare/" >&2
exit 1
