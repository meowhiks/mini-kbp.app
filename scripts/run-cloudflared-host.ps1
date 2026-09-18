# Запуск cloudflared на Windows (вне Docker) — часто надёжнее, если QUIC из контейнера не проходит.
# Требует: cloudflared в PATH, docker compose up (nginx на :80)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$Cfg = Join-Path $Root "docker\cloudflare\config.host.yml"

if (-not (Test-Path $Cfg)) {
    @"
tunnel: 1e4724a0-65d2-4f27-a810-26ac39059c4b
credentials-file: $Root\docker\cloudflare\credentials.json

ingress:
  - hostname: lk.mini-kbp.site
    service: http://127.0.0.1:80
    originRequest:
      httpHostHeader: lk.mini-kbp.site
  - hostname: panel.mini-kbp.site
    service: http://127.0.0.1:80
    originRequest:
      httpHostHeader: panel.mini-kbp.site
  - hostname: mini-kbp.site
    service: http://127.0.0.1:80
    originRequest:
      httpHostHeader: mini-kbp.site
  - service: http_status:404
"@ | Set-Content $Cfg -Encoding UTF8
    Write-Host "Создан $Cfg" -ForegroundColor Yellow
}

$cf = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cf) {
    throw "cloudflared не найден. winget install Cloudflare.cloudflared"
}

Write-Host "Туннель → http://127.0.0.1:80 (nginx в Docker)" -ForegroundColor Cyan
cloudflared tunnel --config $Cfg run
