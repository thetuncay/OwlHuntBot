#!/usr/bin/env bash
# deploy-live.sh — canli deploy + otomatik DB yedek + GitHub push
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "[deploy] DB yedek (on-deploy)..."
bash scripts/cloud-db-backup.sh || echo "[deploy] UYARI: on-deploy yedek basarisiz (devam ediliyor)"

echo "[deploy] Docker bot + worker rebuild..."
docker compose up -d --build --force-recreate --no-deps bot worker

echo "[deploy] GitHub push..."
bash scripts/push-github.sh

echo "[deploy] DB yedek (post-deploy)..."
bash scripts/cloud-db-backup.sh || echo "[deploy] UYARI: post-deploy yedek basarisiz"

echo "[deploy] Tamamlandi."
