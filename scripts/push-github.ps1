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
$branch = (git rev-parse --abbrev-ref HEAD)
$remote = git remote get-url origin
if ($remote -match 'github\.com[:/](.+/.+?)(?:\.git)?$') {
  $repo = $Matches[1]
} else {
  Write-Error "GitHub remote taninmadi: $remote"
  exit 1
}

git push "https://${token}@github.com/${repo}.git" $branch
Write-Host "OK: pushed to origin/$branch" -ForegroundColor Green
