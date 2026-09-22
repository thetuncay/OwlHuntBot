#!/usr/bin/env bash
# stop.sh — Botu PM2 ile durdur
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

pm2 stop owlhuntbot 2>/dev/null || echo "owlhuntbot zaten durmus veya tanimli degil."
pm2 save
echo "Bot durduruldu."
