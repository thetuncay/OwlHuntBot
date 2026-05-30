#!/usr/bin/env bash
# restore-postgres.sh — Windows/eski VDS pg_dump yedeğini Ubuntu PostgreSQL'e yukler
#
# Kullanim:
#   bash scripts/restore-postgres.sh ./owlhuntbot_backup.dump
#
# Desteklenen format: pg_dump -F c (custom/binary) ve duz .sql

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

DUMP_FILE="${1:-./owlhuntbot_backup.dump}"
DB_NAME="${PGDATABASE:-owlhuntbot}"
DB_USER="${PGUSER:-postgres}"

if [ ! -f "${DUMP_FILE}" ]; then
  echo "HATA: Dump dosyasi bulunamadi: ${DUMP_FILE}"
  echo "  Termius SFTP ile yukleyin: ~/OwlHuntBot/owlhuntbot_backup.dump"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "HATA: docker kurulu degil"
  exit 1
fi

echo "============================================================"
echo " PostgreSQL Geri Yukleme"
echo " Dosya: ${DUMP_FILE}"
echo " Veritabani: ${DB_NAME}"
echo "============================================================"

echo ""
echo "[1/6] Bot durduruluyor..."
pm2 stop owlhuntbot 2>/dev/null || true

echo ""
echo "[2/6] PostgreSQL baslatiliyor..."
docker compose up -d postgres
sleep 5

if ! docker compose ps postgres 2>/dev/null | grep -q running; then
  echo "HATA: postgres container calismiyor"
  exit 1
fi

echo ""
echo "[3/6] Mevcut veritabani yedegi aliniyor..."
SAFETY_DIR="./backups/pre-restore-$(date +%Y%m%d-%H%M%S)"
mkdir -p "${SAFETY_DIR}"
docker compose exec -T postgres pg_dump -U "${DB_USER}" -d "${DB_NAME}" -F c \
  > "${SAFETY_DIR}/${DB_NAME}-before-restore.dump" 2>/dev/null \
  || echo "  (bos veya yeni DB — atlandi)"

echo ""
echo "[4/6] Veri geri yukleniyor (bu biraz surebilir)..."

COMPOSE_NETWORK="$(docker compose ps -q postgres 2>/dev/null | xargs docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>/dev/null || echo owlhuntbot_default)"
DUMP_ABS="$(cd "$(dirname "${DUMP_FILE}")" && pwd)/$(basename "${DUMP_FILE}")"

if file "${DUMP_FILE}" 2>/dev/null | grep -qE 'PostgreSQL custom|tar archive'; then
  echo "  Format: pg_dump custom (-F c)"
  echo "  Not: PG17 dump → pg_restore 17 istemcisi kullanilir (PG16 uyumsuzlugu onlenir)"
  docker run --rm \
    -v "${DUMP_ABS}:/tmp/backup.dump:ro" \
    --network "${COMPOSE_NETWORK}" \
    postgres:17-alpine pg_restore \
    -h postgres \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    --clean \
    --if-exists \
    --no-owner \
    --no-acl \
    /tmp/backup.dump
else
  echo "  Format: duz SQL"
  docker compose exec -T postgres psql -U "${DB_USER}" -d "${DB_NAME}" \
    < "${DUMP_FILE}"
fi

echo ""
echo "[5/6] Oyuncu sayisi kontrol..."
docker compose exec -T postgres psql -U "${DB_USER}" -d "${DB_NAME}" -t -c \
  'SELECT COUNT(*) AS players FROM "Player";'

echo ""
echo "[6/6] Redis liderboard senkronu + bot baslat..."
if [ -f .env ]; then
  node --import tsx src/scripts/post-migration.ts 2>/dev/null || echo "  (post-migration atlandi — node/tsx kontrol edin)"
fi

pm2 restart owlhuntbot --update-env 2>/dev/null || pm2 start ecosystem.config.js
pm2 save

echo ""
echo "============================================================"
echo " Geri yukleme tamamlandi"
echo " Guvenlik yedegi: ${SAFETY_DIR}"
echo " Log: pm2 logs owlhuntbot"
echo "============================================================"
