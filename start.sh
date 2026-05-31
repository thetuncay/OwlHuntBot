#!/usr/bin/env bash
# start.sh — Botu PM2 ile baslat
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

mkdir -p logs backups
chmod 755 logs backups

bash scripts/ensure-pnpm.sh

if [ ! -f .env ]; then
  echo "HATA: .env dosyasi yok. Once: cp .env.example .env"
  exit 1
fi

if [ ! -f dist/shard.js ]; then
  echo "dist/ bulunamadi, derleniyor..."
  pnpm build
fi

pm2 start ecosystem.config.js --update-env
pm2 save
echo "Bot baslatildi."
pm2 status owlhuntbot
