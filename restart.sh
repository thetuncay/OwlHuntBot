#!/usr/bin/env bash
# restart.sh — Botu PM2 ile yeniden baslat
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

pm2 restart owlhuntbot --update-env 2>/dev/null || pm2 start ecosystem.config.js
pm2 save
echo "Bot yeniden baslatildi."
pm2 status owlhuntbot
