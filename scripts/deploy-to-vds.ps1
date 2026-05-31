# Windows'tan VDS'e tek komut deploy
# Kullanim: .\scripts\deploy-to-vds.ps1 -VdsHost 123.45.67.89 -User root
param(
  [Parameter(Mandatory = $true)]
  [string]$VdsHost,

  [string]$User = "root",
  [string]$AppDir = "/opt/owlhuntbot",
  [switch]$FirstInstall
)

$ErrorActionPreference = "Stop"
$LocalRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

Write-Host "==> VDS: ${User}@${VdsHost}" -ForegroundColor Cyan

$EnvFile = Join-Path $LocalRoot ".env"
if (-not (Test-Path $EnvFile)) {
  Write-Error ".env bulunamadi: $EnvFile"
}

if ($FirstInstall) {
  Write-Host "==> Ilk kurulum (bootstrap)..."
  Get-Content (Join-Path $LocalRoot "scripts\vds-bootstrap.sh") -Raw | ssh "${User}@${VdsHost}" "export APP_DIR='${AppDir}'; bash -s"
}

Write-Host "==> .env yukleniyor..."
ssh "${User}@${VdsHost}" "mkdir -p ${AppDir}"
scp $EnvFile "${User}@${VdsHost}:${AppDir}/.env"

Write-Host "==> Deploy script calistiriliyor..."
ssh "${User}@${VdsHost}" "cd ${AppDir} && bash scripts/vds-deploy.sh"

Write-Host "==> Tamamlandi." -ForegroundColor Green
Write-Host "Log: ssh ${User}@${VdsHost} 'cd ${AppDir} && docker compose logs -f bot'"
