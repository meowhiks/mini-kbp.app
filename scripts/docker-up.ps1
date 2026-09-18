# Запуск MiniKBP + Cloudflare Tunnel (Windows)
# Используйте этот скрипт вместо «docker compose» — в PATH часто нет Docker Desktop.

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$DockerBin = "C:\Program Files\Docker\Docker\resources\bin"

if (-not (Test-Path "$DockerBin\docker-compose.exe")) {
    throw "Docker Desktop не найден. Установите Docker Desktop и запустите его."
}

$env:PATH = "$DockerBin;" + $env:PATH

# Обход ошибки docker-credential-desktop not in PATH
$tmpCfg = Join-Path $env:TEMP "docker-nocreds"
New-Item -ItemType Directory -Force -Path $tmpCfg | Out-Null
'{"auths":{}}' | Set-Content (Join-Path $tmpCfg "config.json") -Encoding ASCII
$env:DOCKER_CONFIG = $tmpCfg

Set-Location $Root

if (-not (Test-Path ".env")) {
    if (Test-Path "env.example") {
        Copy-Item "env.example" ".env"
        Write-Host "Создан .env из env.example — проверьте значения." -ForegroundColor Yellow
    }
}

if (-not (Test-Path "docker/cloudflare/config.yml")) {
    Write-Host "Нет docker/cloudflare/config.yml — запустите scripts/setup-cloudflare-tunnel.ps1" -ForegroundColor Red
    exit 1
}

& "$DockerBin\docker-compose.exe" --profile tunnel up -d --build @args
Write-Host ""
& "$DockerBin\docker-compose.exe" ps
