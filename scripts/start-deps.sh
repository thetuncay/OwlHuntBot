#!/usr/bin/env bash
# start-deps.sh — PostgreSQL ve Redis'i Docker ile baslat
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "HATA: docker kurulu degil."
  echo "  sudo apt install -y docker.io docker-compose-v2"
  exit 1
fi

echo "PostgreSQL ve Redis baslatiliyor..."
docker compose up -d postgres redis

echo "Bekleniyor..."
sleep 5

docker compose ps postgres redis
docker compose exec -T redis redis-cli ping

echo ""
echo "DATABASE_URL ornegi (.env icin):"
echo "  postgresql://postgres@localhost:5432/owlhuntbot?connection_limit=50&pool_timeout=15"
echo "  REDIS_URL=redis://localhost:6379"
echo ""
echo "Migration: pnpm exec prisma migrate deploy"
echo "Bot restart: pm2 restart owlhuntbot --update-env"
