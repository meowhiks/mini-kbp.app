#Requires -Version 5.1
<#
.SYNOPSIS
  Настройка Cloudflare Tunnel для MiniKBP (DNS через прокси ☁️).

.DESCRIPTION
  1. Устанавливает cloudflared (winget/choco), если нет
  2. Авторизация в Cloudflare
  3. Создаёт туннель и CNAME-записи (proxied) для mini-kbp.site
  4. Готовит docker/cloudflare/config.yml + credentials.json
  5. Создаёт/обновляет .env

  После скрипта:
    docker compose up -d --build
    docker compose --profile tunnel up -d

.EXAMPLE
  .\scripts\setup-cloudflare-tunnel.ps1
  .\scripts\setup-cloudflare-tunnel.ps1 -Domain "mini-kbp.site" -TunnelName "mini-kbp"
#>

param(
    [string]$Domain = "mini-kbp.site",
    [string]$TunnelName = "mini-kbp",
    [string]$ProjectRoot = (Split-Path $PSScriptRoot -Parent)
)

$ErrorActionPreference = "Stop"

$LkHost = "lk.$Domain"
$PanelHost = "panel.$Domain"
$CfDir = Join-Path $ProjectRoot "docker\cloudflare"
$EnvFile = Join-Path $ProjectRoot ".env"
$EnvExample = Join-Path $ProjectRoot "env.example"

function Write-Step([string]$Msg) {
    Write-Host "`n==> $Msg" -ForegroundColor Cyan
}

function Ensure-Cloudflared {
    $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($cmd) {
        Write-Host "cloudflared: $($cmd.Source)" -ForegroundColor Green
        return
    }
    Write-Step "Установка cloudflared"
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements
    } elseif (Get-Command choco -ErrorAction SilentlyContinue) {
        choco install cloudflared -y
    } else {
        throw "Установите cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
    }
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
        throw "cloudflared не найден после установки. Перезапустите терминал."
    }
}

function Ensure-CfDir {
    if (-not (Test-Path $CfDir)) {
        New-Item -ItemType Directory -Path $CfDir -Force | Out-Null
    }
}

function Write-ConfigYml([string]$TunnelId) {
    $configPath = Join-Path $CfDir "config.yml"
    $content = @"
tunnel: $TunnelId
credentials-file: /etc/cloudflared/credentials.json

ingress:
  - hostname: $LkHost
    service: http://nginx:80
    originRequest:
      httpHostHeader: $LkHost

  - hostname: $PanelHost
    service: http://nginx:80
    originRequest:
      httpHostHeader: $PanelHost

  - hostname: $Domain
    service: http://nginx:80
    originRequest:
      httpHostHeader: $Domain

  - service: http_status:404
"@
    Set-Content -Path $configPath -Value $content -Encoding UTF8
    Write-Host "Записан $configPath" -ForegroundColor Green
}

function Update-EnvFile {
    $publicUrl = "https://$LkHost"
    $lines = @()
    if (Test-Path $EnvFile) {
        $lines = Get-Content $EnvFile
    } elseif (Test-Path $EnvExample) {
        $lines = Get-Content $EnvExample
    }

    function Set-EnvLine([string]$Key, [string]$Value) {
        script:lines = $lines | ForEach-Object {
            if ($_ -match "^$([regex]::Escape($Key))=") { "$Key=$Value" } else { $_ }
        }
        if (-not ($script:lines -match "^$([regex]::Escape($Key))=")) {
            $script:lines += "$Key=$Value"
        }
    }

    Set-EnvLine "APP_PUBLIC_URL" $publicUrl
    Set-EnvLine "NEXT_PUBLIC_MINIKBP_SERVER_URL" $publicUrl
    Set-EnvLine "APP_DEPLOY_HOST" $LkHost
    Set-EnvLine "TRUST_PROXY_SSL" "1"
    Set-EnvLine "DJANGO_CORS_ORIGINS" "https://$LkHost,https://$PanelHost,https://$Domain"

    Set-Content -Path $EnvFile -Value $lines -Encoding UTF8
    Write-Host "Обновлён $EnvFile" -ForegroundColor Green
}

Write-Host @"

 Cloudflare Tunnel — MiniKBP
 Домен: $Domain
 Туннель: $TunnelName

"@ -ForegroundColor Yellow

Ensure-Cloudflared
Ensure-CfDir

Write-Step "Вход в Cloudflare (откроется браузер)"
cloudflared tunnel login

Write-Step "Создание туннеля '$TunnelName'"
$tunnelList = cloudflared tunnel list 2>&1 | Out-String
$existing = $null
if ($tunnelList -match "$TunnelName\s+([0-9a-f-]{36})") {
    $existing = $Matches[1]
}

if ($existing) {
    Write-Host "Туннель уже существует: $existing" -ForegroundColor Yellow
    $TunnelId = $existing
} else {
    cloudflared tunnel create $TunnelName
    $tunnelList = cloudflared tunnel list 2>&1 | Out-String
    if ($tunnelList -notmatch "$TunnelName\s+([0-9a-f-]{36})") {
        throw "Не удалось получить UUID туннеля"
    }
    $TunnelId = $Matches[1]
}
Write-Host "Tunnel ID: $TunnelId" -ForegroundColor Green

Write-Step "DNS (CNAME + прокси ☁️) — маршруты через Cloudflare"
foreach ($hostName in @($LkHost, $PanelHost, $Domain)) {
    Write-Host "  $hostName" -ForegroundColor Gray
    cloudflared tunnel route dns $TunnelName $hostName
}

Write-Step "Копирование credentials.json"
$cfHome = Join-Path $env:USERPROFILE ".cloudflared"
$srcCred = Join-Path $cfHome "$TunnelId.json"
$dstCred = Join-Path $CfDir "credentials.json"
if (-not (Test-Path $srcCred)) {
    throw "Не найден $srcCred — повторите cloudflared tunnel create"
}
Copy-Item -Path $srcCred -Destination $dstCred -Force
Write-Host "Скопировано в docker/cloudflare/credentials.json" -ForegroundColor Green

Write-ConfigYml $TunnelId
Update-EnvFile

Write-Host @"

Готово.

1. Запустите стек:
   cd $ProjectRoot
   docker compose up -d --build
   docker compose --profile tunnel up -d

2. Проверьте:
   https://$LkHost/app
   https://$PanelHost/staff

3. В Cloudflare DNS записи должны быть CNAME → $TunnelId.cfargotunnel.com (Proxied ☁️).

Альтернатива — токен из панели Zero Trust:
  Networks → Tunnels → Configure → Docker → скопируйте token в .env как CLOUDFLARE_TUNNEL_TOKEN=
  Ingress в панели: http://nginx:80 + Hostname для каждого поддомена.

"@ -ForegroundColor Green
