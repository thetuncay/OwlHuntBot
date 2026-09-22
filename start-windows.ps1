# OwlHunt — Windows arka plan baslat (PM2 + Docker Postgres/Redis)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Wait-Docker {
  for ($i = 0; $i -lt 60; $i++) {
    docker info 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { return $true }
    Start-Sleep -Seconds 2
  }
  return $false
}

$dockerExe = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
if (-not (Get-Process 'Docker Desktop' -ErrorAction SilentlyContinue)) {
  if (Test-Path $dockerExe) {
    Write-Host 'Docker Desktop aciliyor...'
    Start-Process $dockerExe
  }
}

if (-not (Wait-Docker)) {
  Write-Error 'Docker hazir olmadi. Docker Desktop''i acip tekrar dene.'
}

# Mevcut owlhunt postgres/redis konteynerleri
$pg = docker ps -q -f name=owlhuntbot-postgres-1
$rd = docker ps -q -f name=owlhuntbot-redis-1
if (-not $pg -or -not $rd) {
  Write-Host 'Postgres/Redis baslatiliyor (WSL compose varsa yeniden ayaga kalkar)...'
  # Onceki WSL stack yoksa bu klasordeki compose ile sadece infra
  docker start owlhuntbot-postgres-1 2>$null | Out-Null
  docker start owlhuntbot-redis-1 2>$null | Out-Null
  Start-Sleep -Seconds 3
  $pg = docker ps -q -f name=owlhuntbot-postgres-1
  $rd = docker ps -q -f name=owlhuntbot-redis-1
  if (-not $pg -or -not $rd) {
    Write-Error 'owlhuntbot-postgres-1 / owlhuntbot-redis-1 bulunamadi. Docker Desktop icinde onceki stack''i baslat.'
  }
}

if (-not (Test-Path .env)) {
  Write-Error '.env yok.'
}

pm2 delete owlhunt-bot owlhunt-worker 2>$null | Out-Null
pm2 start ecosystem.windows.config.js
pm2 save

# Docker Desktop penceresini gizle (konteynerler calismaya devam eder)
try {
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinHide {
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
}
"@ -ErrorAction SilentlyContinue
  Get-Process 'Docker Desktop' -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.MainWindowHandle -ne [IntPtr]::Zero) {
      [WinHide]::ShowWindowAsync($_.MainWindowHandle, 0) | Out-Null
    }
  }
} catch {}

Write-Host ''
pm2 status
Write-Host ''
Write-Host 'Bot arka planda (penceresiz). Log: pm2 logs   | Durdur: .\stop-windows.ps1'
