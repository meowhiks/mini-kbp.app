#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Добавляет mini-kbp.site в hosts (127.0.0.1).
  Запуск: правый клик -> "Запуск от имени администратора"
#>

$entries = @(
    "127.0.0.1 mini-kbp.site",
    "127.0.0.1 lk.mini-kbp.site",
    "127.0.0.1 panel.mini-kbp.site",
    "127.0.0.1 localhost.mini-kbp.site"
)

$hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
$content = Get-Content $hostsPath -Raw -ErrorAction Stop

foreach ($line in $entries) {
    $hostname = ($line -split '\s+', 2)[1]
    if ($content -notmatch [regex]::Escape($hostname)) {
        Add-Content -Path $hostsPath -Value $line
        Write-Host "Added: $line" -ForegroundColor Green
    } else {
        Write-Host "Already exists: $hostname" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Hosts OK. Start stack:" -ForegroundColor Cyan
Write-Host "  docker compose up -d --build"
Write-Host ""
Write-Host "  lk.mini-kbp.site      -> личный кабинет (Telegram-вход только здесь)"
Write-Host "  panel.mini-kbp.site   -> админка"
Write-Host "  localhost:3000        -> Next.js напрямую (без Telegram-виджета)"
Write-Host "  localhost:8000        -> Django напрямую"
