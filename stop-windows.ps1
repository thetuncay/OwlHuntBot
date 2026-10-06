# OwlHunt — Windows arka plan durdur (kapanis / logoff)
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot

$logDir = Join-Path $PSScriptRoot 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir 'autostart.log'

function Write-AutoLog([string]$msg) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg"
  Add-Content -Path $logFile -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue
  Write-Host $line
}

$machinePath = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
$userPath = [System.Environment]::GetEnvironmentVariable('Path', 'User')
$env:Path = "$machinePath;$userPath"

Write-AutoLog '=== OwlHunt stop-windows basladi ==='

if (Get-Command pm2 -ErrorAction SilentlyContinue) {
  pm2 stop owlhunt-bot owlhunt-worker 2>$null | Out-Null
  pm2 delete owlhunt-bot owlhunt-worker 2>$null | Out-Null
  pm2 save --force 2>$null | Out-Null
  Write-AutoLog 'PM2 owlhunt surecleri durduruldu'
} else {
  Write-AutoLog 'pm2 bulunamadi — atlandi'
}

Write-AutoLog '=== OwlHunt stop-windows bitti ==='
exit 0
