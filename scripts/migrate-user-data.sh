#!/usr/bin/env bash
# migrate-user-data.sh — Eski MongoDB verisini PostgreSQL'e aktarir
#
# Kullanim:
#   bash scripts/migrate-user-data.sh                    # MONGODB_URL'den canli okur
#   bash scripts/migrate-user-data.sh ./backups/klasor    # JSON yedekten okur
#
# Gereksinimler (.env):
#   DATABASE_URL=postgresql://...
#   MONGODB_URL=mongodb://...  (canli aktarim icin)
#   REDIS_URL=redis://...

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

BACKUP_SOURCE="${1:-}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_ROOT="./backups/migration-${STAMP}"

echo "============================================================"
echo " OwlHuntBot — Kullanici Verisi Aktarimi (MongoDB → PostgreSQL)"
echo "============================================================"

if [ ! -f .env ]; then
  echo "HATA: .env bulunamadi"
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

if [ -z "${DATABASE_URL:-}" ]; then
  echo "HATA: DATABASE_URL tanimli degil"
  exit 1
fi

if [ -z "${BACKUP_SOURCE}" ] && [ -z "${MONGODB_URL:-}" ]; then
  echo "HATA: MONGODB_URL veya yedek klasoru gerekli"
  echo "  bash scripts/migrate-user-data.sh ./backups/eski-yedek"
  exit 1
fi

mkdir -p "${BACKUP_ROOT}"

echo ""
echo "[1/7] Bot durduruluyor..."
pm2 stop owlhuntbot 2>/dev/null || true

echo ""
echo "[2/7] PostgreSQL yedegi aliniyor..."
if docker compose ps postgres 2>/dev/null | grep -q running; then
  docker compose exec -T postgres pg_dump -U postgres owlhuntbot > "${BACKUP_ROOT}/postgresql-before.sql"
  echo "  → ${BACKUP_ROOT}/postgresql-before.sql"
else
  echo "  UYARI: Docker postgres calismiyor, pg_dump atlandi"
fi

echo ""
echo "[3/7] MongoDB yedegi aliniyor..."
if [ -n "${BACKUP_SOURCE}" ]; then
  echo "  JSON yedek kullanilacak: ${BACKUP_SOURCE}"
  MONGO_BACKUP_DIR="${BACKUP_SOURCE}"
elif [ -n "${MONGODB_URL:-}" ]; then
  MONGO_BACKUP_DIR="${BACKUP_ROOT}/mongo"
  node --import tsx src/scripts/backup-mongodb.ts "${MONGO_BACKUP_DIR}"
else
  MONGO_BACKUP_DIR=""
fi

echo ""
echo "[4/7] Prisma migration..."
pnpm exec prisma migrate deploy 2>/dev/null || pnpm exec prisma db push

echo ""
echo "[5/7] Veri aktarimi..."
export MIGRATION_CONFIRM=yes
if [ -n "${BACKUP_SOURCE}" ]; then
  node --import tsx src/scripts/migrate-mongodb-to-pg.ts --from-backup "${BACKUP_SOURCE}"
else
  node --import tsx src/scripts/migrate-mongodb-to-pg.ts
fi

echo ""
echo "[6/7] Redis liderboard senkronu..."
node --import tsx src/scripts/post-migration.ts

echo ""
echo "[7/7] Bot yeniden baslatiliyor..."
pm2 restart owlhuntbot --update-env || pm2 start ecosystem.config.js
pm2 save

echo ""
echo "============================================================"
echo " Aktarim tamamlandi"
echo " Yedekler: ${BACKUP_ROOT}"
echo " Log: pm2 logs owlhuntbot"
echo "============================================================"
