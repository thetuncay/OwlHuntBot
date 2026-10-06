# OwlHunt — Windows arka plan baslat (PM2 + Docker Postgres/Redis)
# Otomatik acilis: scripts\install-autostart-windows.ps1
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot

$logDir = Join-Path $PSScriptRoot 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir 'autostart.log'

function Write-AutoLog([string]$msg) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg"
  Add-Content -Path $logFile -Value $line -Encoding UTF8
  Write-Host $line
}

# Scheduled Task dar PATH getirir — Node/pm2/docker bulunsun
$machinePath = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
$userPath = [System.Environment]::GetEnvironmentVariable('Path', 'User')
$env:Path = "$machinePath;$userPath"

Write-AutoLog '=== OwlHunt start-windows basladi ==='

function Wait-Docker {
  param([int]$MaxTries = 120)
  for ($i = 1; $i -le $MaxTries; $i++) {
    docker info 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
      Write-AutoLog "Docker hazir (deneme $i)"
      return $true
    }
    if ($i % 10 -eq 0) { Write-AutoLog "Docker bekleniyor... $i/$MaxTries" }
    Start-Sleep -Seconds 2
  }
  return $false
}

function Wait-Infra {
  param([int]$MaxTries = 60)
  for ($i = 1; $i -le $MaxTries; $i++) {
    $pg = docker ps -q -f name=owlhuntbot-postgres-1 2>$null
    $rd = docker ps -q -f name=owlhuntbot-redis-1 2>$null
    if ($pg -and $rd) {
      docker exec owlhuntbot-postgres-1 pg_isready -U postgres -d owlhuntbot 2>$null | Out-Null
      $pgOk = ($LASTEXITCODE -eq 0)
      docker exec owlhuntbot-redis-1 redis-cli ping 2>$null | Out-Null
      $rdOk = ($LASTEXITCODE -eq 0)
      if ($pgOk -and $rdOk) {
        Write-AutoLog "Postgres/Redis hazir (deneme $i)"
        return $true
      }
    }
    if ($i % 5 -eq 0) { Write-AutoLog "Infra bekleniyor... $i/$MaxTries" }
    Start-Sleep -Seconds 2
  }
  return $false
}

$dockerExe = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
if (-not (Get-Process 'Docker Desktop' -ErrorAction SilentlyContinue)) {
  if (Test-Path $dockerExe) {
    Write-AutoLog 'Docker Desktop aciliyor...'
    Start-Process $dockerExe
  } else {
    Write-AutoLog 'HATA: Docker Desktop.exe bulunamadi'
    exit 1
  }
}

if (-not (Wait-Docker)) {
  Write-AutoLog 'HATA: Docker engine hazir olmadi'
  exit 1
}

$pg = docker ps -q -f name=owlhuntbot-postgres-1 2>$null
$rd = docker ps -q -f name=owlhuntbot-redis-1 2>$null
if (-not $pg -or -not $rd) {
  Write-AutoLog 'Postgres/Redis konteynerleri baslatiliyor...'
  docker start owlhuntbot-postgres-1 2>$null | Out-Null
  docker start owlhuntbot-redis-1 2>$null | Out-Null
}

if (-not (Wait-Infra)) {
  Write-AutoLog 'HATA: owlhuntbot-postgres-1 / owlhuntbot-redis-1 hazir degil'
  exit 1
}

if (-not (Test-Path (Join-Path $PSScriptRoot '.env'))) {
  Write-AutoLog 'HATA: .env yok'
  exit 1
}

$pm2 = Get-Command pm2 -ErrorAction SilentlyContinue
if (-not $pm2) {
  Write-AutoLog 'HATA: pm2 PATH''te yok'
  exit 1
}

Write-AutoLog 'PM2 surecleri baslatiliyor...'
pm2 delete owlhunt-bot owlhunt-worker 2>$null | Out-Null
pm2 start (Join-Path $PSScriptRoot 'ecosystem.windows.config.js')
if ($LASTEXITCODE -ne 0) {
  Write-AutoLog 'HATA: pm2 start basarisiz — 10 sn sonra tekrar'
  Start-Sleep -Seconds 10
  pm2 start (Join-Path $PSScriptRoot 'ecosystem.windows.config.js')
}
pm2 save 2>$null | Out-Null

# Docker Desktop penceresini gizle
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

$list = pm2 jlist 2>$null
Write-AutoLog "PM2 start tamam. status snapshot len=$($list.Length)"
Write-AutoLog '=== OwlHunt start-windows bitti ==='
exit 0
