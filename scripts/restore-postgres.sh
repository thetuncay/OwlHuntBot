#!/usr/bin/env bash
# restore-postgres.sh — Windows/eski VDS pg_dump yedeğini Ubuntu PostgreSQL'e yukler
#
# Kullanim:
#   bash scripts/restore-postgres.sh ./owlhuntbot_backup.dump
#
# PG major surum degisimi (16→17): once volume sifirlanmali:
#   bash scripts/restore-postgres.sh --reset-volume ./owlhuntbot_backup.dump

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

RESET_VOLUME=false
DUMP_FILE=""

for arg in "$@"; do
  if [ "${arg}" = "--reset-volume" ]; then
    RESET_VOLUME=true
  elif [ -z "${DUMP_FILE}" ]; then
    DUMP_FILE="${arg}"
  fi
done

DUMP_FILE="${DUMP_FILE:-./owlhuntbot_backup.dump}"
DB_NAME="${PGDATABASE:-owlhuntbot}"
DB_USER="${PGUSER:-postgres}"

if [ ! -f "${DUMP_FILE}" ]; then
  echo "HATA: Dump dosyasi bulunamadi: ${DUMP_FILE}"
  exit 1
fi

echo "============================================================"
echo " PostgreSQL Geri Yukleme"
echo " Dosya: ${DUMP_FILE}"
echo "============================================================"

echo ""
echo "[1/7] Bot durduruluyor..."
pm2 stop owlhuntbot 2>/dev/null || true

if [ "${RESET_VOLUME}" = true ]; then
  echo ""
  echo "[2/7] PostgreSQL volume sifirlaniyor (PG surum degisimi)..."
  docker compose down postgres 2>/dev/null || true
  docker volume rm owlhuntbot_postgres_data 2>/dev/null || true
fi

echo ""
echo "[3/7] PostgreSQL baslatiliyor..."
docker compose up -d postgres
echo "  Postgres hazir olana kadar bekleniyor..."
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U "${DB_USER}" >/dev/null 2>&1; then
    echo "  Postgres hazir (${i}s)"
    break
  fi
  if [ "${i}" -eq 30 ]; then
    echo "HATA: Postgres 30 saniyede hazir olmadi. Log:"
    docker compose logs postgres --tail 30
    exit 1
  fi
  sleep 1
done

echo ""
echo "[4/7] Mevcut DB yedegi..."
SAFETY_DIR="./backups/pre-restore-$(date +%Y%m%d-%H%M%S)"
mkdir -p "${SAFETY_DIR}"
docker compose exec -T postgres pg_dump -U "${DB_USER}" -d "${DB_NAME}" -F c \
  > "${SAFETY_DIR}/${DB_NAME}-before-restore.dump" 2>/dev/null \
  || echo "  (atlandi)"

echo ""
echo "[5/7] Veri geri yukleniyor..."
CONTAINER="$(docker compose ps -q postgres)"
DUMP_ABS="$(cd "$(dirname "${DUMP_FILE}")" && pwd)/$(basename "${DUMP_FILE}")"
docker cp "${DUMP_ABS}" "${CONTAINER}:/tmp/backup.dump"

docker compose exec postgres pg_restore \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  /tmp/backup.dump

docker compose exec postgres rm -f /tmp/backup.dump

echo ""
echo "[6/7] Oyuncu sayisi..."
docker compose exec -T postgres psql -U "${DB_USER}" -d "${DB_NAME}" -t -c \
  'SELECT COUNT(*) FROM "Player";'

echo ""
echo "[7/7] Redis + bot..."
docker compose up -d redis 2>/dev/null || true
node --import tsx src/scripts/post-migration.ts 2>/dev/null || true
pm2 restart owlhuntbot --update-env 2>/dev/null || pm2 start ecosystem.config.js
pm2 save

echo ""
echo "============================================================"
echo " Tamamlandi. Log: pm2 logs owlhuntbot"
echo "============================================================"
