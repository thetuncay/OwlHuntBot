#!/usr/bin/env bash
# Otomatik GitHub push — GITHUB_TOKEN .env icinde (commit edilmez)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ -z "${GITHUB_TOKEN:-}" ] && [ -f .env ]; then
  GITHUB_TOKEN="$(grep -E '^\s*GITHUB_TOKEN\s*=' .env | tail -1 | cut -d= -f2- | tr -d ' "'\''')"
  export GITHUB_TOKEN
fi

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "HATA: GITHUB_TOKEN yok. .env dosyasina ekle: GITHUB_TOKEN=ghp_..." >&2
  exit 1
fi

# Remote URL asla token icermemeli
ORIGIN="$(git remote get-url origin 2>/dev/null || true)"
if [ -z "$ORIGIN" ]; then
  git remote add origin https://github.com/thetuncay/OwlHuntBot.git
elif echo "$ORIGIN" | grep -Eq 'ghp_|github_pat_'; then
  git remote set-url origin https://github.com/thetuncay/OwlHuntBot.git
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
AUTH="$(printf 'x-access-token:%s' "$GITHUB_TOKEN" | base64 | tr -d '\n')"
git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic ${AUTH}" push -u origin "$BRANCH"
echo "OK: pushed to origin/$BRANCH"
