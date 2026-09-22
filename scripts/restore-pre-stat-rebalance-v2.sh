#!/usr/bin/env bash
# restore-pre-stat-rebalance-v2.sh — pre-stat-rebalance-v2 yedeğinden bire bir geri yukleme
#
# Kullanim:
#   bash scripts/restore-pre-stat-rebalance-v2.sh ./backups/pre-stat-rebalance-v2-YYYYMMDD-HHMMSS
#   bash scripts/restore-pre-stat-rebalance-v2.sh   # LATEST symlink kullanir
#
# PG + Redis birlikte restore edilir. Mevcut durumdan once guvenlik yedegi alinir.

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

DB_NAME="${PGDATABASE:-owlhuntbot}"
DB_USER="${PGUSER:-postgres}"
REDIS_VOLUME="${REDIS_VOLUME:-owlhuntbot_redis-data}"

BACKUP_DIR="${1:-./backups/pre-stat-rebalance-v2-LATEST}"
if [ ! -d "${BACKUP_DIR}" ]; then
  echo "HATA: Yedek klasoru bulunamadi: ${BACKUP_DIR}"
  exit 1
fi

BACKUP_DIR="$(cd "${BACKUP_DIR}" && pwd)"
MANIFEST="${BACKUP_DIR}/manifest.json"
PG_DUMP="${BACKUP_DIR}/owlhuntbot.dump"
REDIS_RDB="${BACKUP_DIR}/redis.rdb"

for f in "${MANIFEST}" "${PG_DUMP}" "${REDIS_RDB}"; do
  if [ ! -f "${f}" ]; then
    echo "HATA: Eksik dosya: ${f}"
    exit 1
  fi
done

echo "============================================================"
echo " Stat Rebalance V2 — Geri Yukleme"
echo " Kaynak: ${BACKUP_DIR}"
echo "============================================================"

if [ "${SKIP_CONFIRM:-}" != "yes" ]; then
  echo ""
  echo "UYARI: Mevcut PostgreSQL + Redis verisi degisecek."
  echo "Devam icin: SKIP_CONFIRM=yes bash scripts/restore-pre-stat-rebalance-v2.sh \"${BACKUP_DIR}\""
  exit 1
fi

verify_sha() {
  local file="$1"
  local expected="$2"
  local actual
  actual="$(sha256sum "${file}" | awk '{print $1}')"
  if [ "${actual}" != "${expected}" ]; then
    echo "HATA: Checksum uyusmaz (${file})"
    echo "  beklenen: ${expected}"
    echo "  gercek  : ${actual}"
    exit 1
  fi
}

PG_SHA="$(node -e "console.log(JSON.parse(require('fs').readFileSync('${MANIFEST}','utf8')).postgres.sha256)")"
REDIS_SHA="$(node -e "console.log(JSON.parse(require('fs').readFileSync('${MANIFEST}','utf8')).redis.sha256)")"
verify_sha "${PG_DUMP}" "${PG_SHA}"
verify_sha "${REDIS_RDB}" "${REDIS_SHA}"
echo "Checksum OK"

echo ""
echo "[1/8] Bot durduruluyor..."
pm2 stop owlhuntbot-shard owlhuntbot-worker owlhuntbot-ops-panel 2>/dev/null || true

echo ""
echo "[2/8] Guvenlik yedegi (mevcut durum)..."
SAFETY_DIR="./backups/pre-restore-safety-$(date +%Y%m%d-%H%M%S)"
mkdir -p "${SAFETY_DIR}"
docker compose exec -T postgres pg_dump -U "${DB_USER}" -d "${DB_NAME}" -F c \
  > "${SAFETY_DIR}/owlhuntbot-before-restore.dump" 2>/dev/null || true
REDIS_CONTAINER="$(docker compose ps -q redis)"
docker cp "${REDIS_CONTAINER}:/data/dump.rdb" "${SAFETY_DIR}/redis-before-restore.rdb" 2>/dev/null || true
echo "  ${SAFETY_DIR}"

echo ""
echo "[3/8] PostgreSQL geri yukleniyor..."
docker compose up -d postgres
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U "${DB_USER}" >/dev/null 2>&1; then
    break
  fi
  [ "${i}" -eq 30 ] && { echo "HATA: Postgres hazir degil"; exit 1; }
  sleep 1
done

CONTAINER="$(docker compose ps -q postgres)"
DUMP_ABS="${PG_DUMP}"
docker cp "${DUMP_ABS}" "${CONTAINER}:/tmp/restore.dump"
docker compose exec -T postgres pg_restore \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  /tmp/restore.dump
docker compose exec -T postgres rm -f /tmp/restore.dump

echo ""
echo "[4/8] PostgreSQL dogrulama..."
COUNTS="$(docker compose exec -T postgres psql -U "${DB_USER}" -d "${DB_NAME}" -t -A -c \
  'SELECT (SELECT COUNT(*) FROM "Player"), (SELECT COUNT(*) FROM "Owl"), (SELECT COUNT(*) FROM "RebalanceCompensation");' \
  | tr -d ' \r\n')"
IFS='|' read -r PLAYER_COUNT OWL_COUNT COMP_COUNT <<< "${COUNTS}"
EXP_PLAYER="$(node -e "console.log(JSON.parse(require('fs').readFileSync('${MANIFEST}','utf8')).postgres.counts.players)")"
EXP_OWL="$(node -e "console.log(JSON.parse(require('fs').readFileSync('${MANIFEST}','utf8')).postgres.counts.owls)")"
EXP_COMP="$(node -e "console.log(JSON.parse(require('fs').readFileSync('${MANIFEST}','utf8')).postgres.counts.rebalanceCompensation)")"
echo "  Player=${PLAYER_COUNT} (beklenen ${EXP_PLAYER})"
echo "  Owl=${OWL_COUNT} (beklenen ${EXP_OWL})"
echo "  RebalanceCompensation=${COMP_COUNT} (beklenen ${EXP_COMP})"
if [ "${PLAYER_COUNT}" != "${EXP_PLAYER}" ] || [ "${OWL_COUNT}" != "${EXP_OWL}" ] || [ "${COMP_COUNT}" != "${EXP_COMP}" ]; then
  echo "HATA: PG satir sayilari manifest ile uyusmuyor."
  exit 1
fi

echo ""
echo "[5/8] Redis geri yukleniyor..."
docker compose stop redis
docker run --rm \
  -v "${REDIS_VOLUME}:/data" \
  -v "${BACKUP_DIR}:/backup:ro" \
  alpine sh -c 'cp /backup/redis.rdb /data/dump.rdb && chmod 644 /data/dump.rdb'
docker compose start redis
for i in $(seq 1 30); do
  if redis-cli -p 6380 ping 2>/dev/null | grep -q PONG; then
    break
  fi
  [ "${i}" -eq 30 ] && { echo "HATA: Redis hazir degil"; exit 1; }
  sleep 1
done

echo ""
echo "[6/8] Redis dogrulama..."
REDIS_DBSIZE="$(redis-cli -p 6380 DBSIZE 2>/dev/null | awk '{print $2}')"
EXP_DBSIZE="$(node -e "console.log(JSON.parse(require('fs').readFileSync('${MANIFEST}','utf8')).redis.dbsize)")"
echo "  dbsize=${REDIS_DBSIZE} (beklenen ${EXP_DBSIZE})"

echo ""
echo "[7/8] Liderboard senkronu (post-migration)..."
node --import tsx src/scripts/post-migration.ts 2>/dev/null || echo "  (post-migration atlandi veya hata — manuel calistir)"

echo ""
echo "[8/8] Tamamlandi."
echo ""
echo "Botu baslatmak icin (onay sonrasi):"
echo "  pm2 restart owlhuntbot-shard owlhuntbot-worker owlhuntbot-ops-panel"
echo ""
echo "Guvenlik yedegi (restore oncesi hali): ${SAFETY_DIR}"
echo "============================================================"
