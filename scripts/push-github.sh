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

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
REMOTE="$(git remote get-url origin)"
REPO="$(echo "$REMOTE" | sed -E 's#.*github.com[:/](.+/.+?)(\.git)?$#\1#')"

git push "https://${GITHUB_TOKEN}@github.com/${REPO}.git" "$BRANCH"
echo "OK: pushed to origin/$BRANCH"
