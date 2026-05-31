#!/usr/bin/env bash
# VDS guncelleme / yeniden baslatma
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/owlhuntbot}"
cd "${APP_DIR}"

if [ ! -f .env ]; then
  echo "HATA: ${APP_DIR}/.env yok. Once vds-bootstrap.sh calistir."
  exit 1
fi

if [ -d .git ]; then
  echo "==> Git pull..."
  git pull --ff-only origin main || git pull --ff-only
fi

echo "==> Docker build & start..."
docker compose down --remove-orphans 2>/dev/null || true
docker compose up -d --build

echo "==> Servis durumu (15 sn bekleniyor)..."
sleep 15
docker compose ps

echo "==> Health check..."
if curl -sf http://127.0.0.1/health | grep -q ok; then
  echo "OK: Bot health endpoint yanit veriyor."
else
  echo "UYARI: Health henuz hazir degil. Log: docker compose logs -f bot"
fi

echo ""
echo "Log izle:  cd ${APP_DIR} && docker compose logs -f bot"
echo "Durdur:    cd ${APP_DIR} && docker compose down"
