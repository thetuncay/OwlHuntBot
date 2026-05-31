#!/usr/bin/env bash
# update.sh — Kod guncelleme, yeniden derleme ve PM2 restart
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

echo "=== OwlHuntBot Guncelleme ==="

bash scripts/ensure-pnpm.sh

if [ -d .git ]; then
  echo "[1/6] Git pull..."
  git pull --ff-only
fi

echo "[2/6] Bagimliliklar..."
pnpm install --frozen-lockfile

echo "[3/6] Prisma migrate (dogrudan Postgres)..."
if pm2 describe owlhuntbot-shard >/dev/null 2>&1; then
  pm2 stop owlhuntbot-shard owlhuntbot-worker 2>/dev/null || true
fi
pnpm db:migrate

echo "[4/6] Prisma client..."
pnpm prisma:generate

echo "[5/6] Derleme..."
pnpm build

echo "[6/6] PM2 restart..."
if pm2 describe owlhuntbot-shard >/dev/null 2>&1; then
  pm2 restart owlhuntbot-shard owlhuntbot-worker --update-env
else
  pm2 start ecosystem.config.js
fi
pm2 save

echo "=== Guncelleme tamamlandi ==="
pm2 status owlhuntbot-shard owlhuntbot-worker
