# Otomatik GitHub push — GITHUB_TOKEN .env icinde (commit edilmez)
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$EnvFile = Join-Path $Root ".env"

$token = $env:GITHUB_TOKEN
if (-not $token -and (Test-Path $EnvFile)) {
  Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*GITHUB_TOKEN\s*=\s*(.+)\s*$') {
      $token = $Matches[1].Trim().Trim('"').Trim("'")
    }
  }
}

if (-not $token) {
  Write-Error "GITHUB_TOKEN yok. .env dosyasina ekle: GITHUB_TOKEN=ghp_..."
  exit 1
}

Set-Location $Root

# Remote URL asla token icermemeli
$origin = (git remote get-url origin 2>$null)
if (-not $origin) {
  git remote add origin https://github.com/thetuncay/OwlHuntBot.git
  $origin = "https://github.com/thetuncay/OwlHuntBot.git"
}
if ($origin -match 'ghp_|github_pat_') {
  git remote set-url origin https://github.com/thetuncay/OwlHuntBot.git
}
if ((git remote get-url origin) -notmatch 'github\.com[:/](.+/.+?)(?:\.git)?$') {
  Write-Error "GitHub remote taninmadi: $(git remote get-url origin)"
  exit 1
}

$branch = (git rev-parse --abbrev-ref HEAD)
$auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("x-access-token:$token"))
git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic $auth" push -u origin $branch
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "OK: pushed to origin/$branch" -ForegroundColor Green
