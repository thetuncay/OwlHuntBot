# Windows'tan VDS'e deploy (GitHub push gerekmez — yerel dosyalar gider)
#
# Ilk kurulum:
#   .\scripts\deploy-to-vds.ps1 -VdsHost 123.45.67.89 -FirstInstall
#
# Guncelleme:
#   .\scripts\deploy-to-vds.ps1 -VdsHost 123.45.67.89
param(
  [Parameter(Mandatory = $true)]
  [string]$VdsHost,

  [string]$User = "root",
  [string]$AppDir = "/opt/owlhuntbot",
  [switch]$FirstInstall
)

$ErrorActionPreference = "Stop"
$LocalRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

Write-Host "==> VDS: ${User}@${VdsHost}" -ForegroundColor Cyan

$EnvFile = Join-Path $LocalRoot ".env"
if (-not (Test-Path $EnvFile)) {
  Write-Error ".env bulunamadi: $EnvFile"
}

if ($FirstInstall) {
  Write-Host "==> Docker + dizin hazirligi..."
  ssh "${User}@${VdsHost}" @"
set -e
if ! command -v docker >/dev/null 2>&1; then
  apt-get update -qq && apt-get install -y ca-certificates curl git
  curl -fsSL https://get.docker.io | sh
  systemctl enable docker && systemctl start docker
fi
mkdir -p ${AppDir}
"@
}

Write-Host "==> Proje dosyalari paketleniyor..."
$Archive = Join-Path $env:TEMP "owlhuntbot-deploy.tgz"
if (Test-Path $Archive) { Remove-Item $Archive -Force }

Push-Location $LocalRoot
try {
  tar -czf $Archive `
    --exclude=node_modules `
    --exclude=.git `
    --exclude=dist `
    --exclude=.pgdata `
    --exclude=*.log `
    --exclude=server_log.txt `
    .
} finally {
  Pop-Location
}

Write-Host "==> VDS'e yukleniyor..."
scp $Archive "${User}@${VdsHost}:/tmp/owlhuntbot-deploy.tgz"
scp $EnvFile "${User}@${VdsHost}:${AppDir}/.env"

ssh "${User}@${VdsHost}" @"
set -e
mkdir -p ${AppDir}
cd ${AppDir}
tar xzf /tmp/owlhuntbot-deploy.tgz
rm -f /tmp/owlhuntbot-deploy.tgz
chmod +x scripts/*.sh 2>/dev/null || true
bash scripts/vds-deploy.sh
"@

Remove-Item $Archive -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "==> Deploy tamamlandi." -ForegroundColor Green
Write-Host "Log:  ssh ${User}@${VdsHost} 'cd ${AppDir} && docker compose logs -f bot'"
Write-Host "Test: curl http://${VdsHost}/health"
