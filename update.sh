#!/usr/bin/env bash
# update.sh — Kod guncelleme, yeniden derleme ve PM2 restart
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

echo "=== OwlHuntBot Guncelleme ==="

bash scripts/ensure-pnpm.sh

if [ -d .git ]; then
  echo "[1/5] Git pull..."
  git pull --ff-only
fi

echo "[2/5] Bagimliliklar..."
pnpm install --frozen-lockfile

echo "[3/5] Prisma client..."
pnpm prisma:generate

echo "[4/5] Derleme..."
pnpm build

echo "[5/5] PM2 restart..."
if pm2 describe owlhuntbot-shard >/dev/null 2>&1; then
  pm2 restart owlhuntbot-shard owlhuntbot-worker --update-env
else
  pm2 start ecosystem.config.js
fi
pm2 save

echo "=== Guncelleme tamamlandi ==="
pm2 status owlhuntbot-shard owlhuntbot-worker
