#!/usr/bin/env bash
# backup-pre-stat-rebalance-v2.sh — Stat Rebalance V2 apply oncesi tam yedek (PG + Redis)
#
# Kullanim:
#   bash scripts/backup-pre-stat-rebalance-v2.sh
#
# Cikti: ./backups/pre-stat-rebalance-v2-YYYYMMDD-HHMMSS/
#   owlhuntbot.dump   — PostgreSQL custom format (pg_restore ile geri yukleme)
#   redis.rdb         — Redis anlik snapshot
#   manifest.json     — checksum, satir sayilari, geri yukleme komutu
#   RESTORE.md        — adim adim geri donus notu
#
# Onkosul: owlhuntbot-shard ve owlhuntbot-worker durmus olmali (Redis/ PG tutarliligi).

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

DB_NAME="${PGDATABASE:-owlhuntbot}"
DB_USER="${PGUSER:-postgres}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="./backups/pre-stat-rebalance-v2-${STAMP}"
LATEST_LINK="./backups/pre-stat-rebalance-v2-LATEST"

require_stopped() {
  local name="$1"
  local status
  status="$(pm2 jlist 2>/dev/null | node -e "
    const apps = JSON.parse(require('fs').readFileSync(0,'utf8'));
    const a = apps.find(x => x.name === process.argv[1]);
    process.stdout.write(a?.pm2_env?.status ?? 'unknown');
  " "$name" 2>/dev/null || echo "unknown")"
  if [ "$status" = "online" ]; then
    echo "HATA: ${name} hala calisiyor. Once durdur:"
    echo "  pm2 stop owlhuntbot-shard owlhuntbot-worker"
    exit 1
  fi
}

echo "============================================================"
echo " Stat Rebalance V2 — On-Apply Yedek"
echo " Hedef: ${BACKUP_DIR}"
echo "============================================================"

require_stopped "owlhuntbot-shard"
require_stopped "owlhuntbot-worker"

mkdir -p "${BACKUP_DIR}"

echo ""
echo "[1/6] PostgreSQL hazirlik..."
if ! docker compose exec -T postgres pg_isready -U "${DB_USER}" >/dev/null 2>&1; then
  echo "HATA: Postgres hazir degil."
  exit 1
fi

COUNTS="$(docker compose exec -T postgres psql -U "${DB_USER}" -d "${DB_NAME}" -t -A -c \
  'SELECT (SELECT COUNT(*) FROM "Player"), (SELECT COUNT(*) FROM "Owl"), (SELECT COUNT(*) FROM "RebalanceCompensation");' \
  | tr -d ' \r\n')"
IFS='|' read -r PLAYER_COUNT OWL_COUNT COMP_COUNT <<< "${COUNTS}"

echo "  Player=${PLAYER_COUNT} Owl=${OWL_COUNT} RebalanceCompensation=${COMP_COUNT}"

echo ""
echo "[2/6] PostgreSQL dump (custom format)..."
docker compose exec -T postgres pg_dump -U "${DB_USER}" -d "${DB_NAME}" -F c \
  > "${BACKUP_DIR}/owlhuntbot.dump"

echo ""
echo "[3/6] Dump dogrulama (pg_restore --list)..."
if ! docker compose exec -T postgres pg_restore --list /dev/stdin \
  < "${BACKUP_DIR}/owlhuntbot.dump" >/dev/null 2>&1; then
  # stdin pipe bazi ortamlarda calismayabilir; container icinde kopyala
  CONTAINER="$(docker compose ps -q postgres)"
  DUMP_ABS="$(cd "${BACKUP_DIR}" && pwd)/owlhuntbot.dump"
  docker cp "${DUMP_ABS}" "${CONTAINER}:/tmp/verify.dump"
  docker compose exec -T postgres pg_restore --list /tmp/verify.dump >/dev/null
  docker compose exec -T postgres rm -f /tmp/verify.dump
fi
DUMP_BYTES="$(wc -c < "${BACKUP_DIR}/owlhuntbot.dump" | tr -d ' ')"
echo "  OK — ${DUMP_BYTES} byte"

echo ""
echo "[4/6] Redis snapshot..."
REDIS_CONTAINER="$(docker compose ps -q redis)"
docker compose exec -T redis redis-cli BGSAVE >/dev/null
for i in $(seq 1 60); do
  IN_PROGRESS="$(docker compose exec -T redis redis-cli INFO persistence \
    | grep '^rdb_bgsave_in_progress:' | cut -d: -f2 | tr -d ' \r\n')"
  if [ "${IN_PROGRESS}" = "0" ]; then
    break
  fi
  sleep 1
done
REDIS_DBSIZE="$(docker compose exec -T redis redis-cli DBSIZE 2>/dev/null | tr -dc '0-9')"
REDIS_DBSIZE="${REDIS_DBSIZE:-0}"
docker cp "${REDIS_CONTAINER}:/data/dump.rdb" "${BACKUP_DIR}/redis.rdb"
REDIS_BYTES="$(wc -c < "${BACKUP_DIR}/redis.rdb" | tr -d ' ')"
echo "  OK — dbsize=${REDIS_DBSIZE}, ${REDIS_BYTES} byte"

echo ""
echo "[5/6] Checksum + manifest..."
PG_SHA="$(sha256sum "${BACKUP_DIR}/owlhuntbot.dump" | awk '{print $1}')"
REDIS_SHA="$(sha256sum "${BACKUP_DIR}/redis.rdb" | awk '{print $1}')"
GIT_COMMIT="$(git rev-parse HEAD 2>/dev/null || echo "unknown")"
GIT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")"
CREATED_AT="$(date -Iseconds)"

cat > "${BACKUP_DIR}/manifest.json" <<EOF
{
  "label": "pre-stat-rebalance-v2",
  "createdAt": "${CREATED_AT}",
  "purpose": "Stat Rebalance V2 --apply oncesi bire bir geri donus noktasi",
  "gitCommit": "${GIT_COMMIT}",
  "gitBranch": "${GIT_BRANCH}",
  "botProcesses": {
    "owlhuntbot-shard": "stopped",
    "owlhuntbot-worker": "stopped"
  },
  "postgres": {
    "file": "owlhuntbot.dump",
    "format": "custom",
    "sha256": "${PG_SHA}",
    "bytes": ${DUMP_BYTES},
    "counts": {
      "players": ${PLAYER_COUNT},
      "owls": ${OWL_COUNT},
      "rebalanceCompensation": ${COMP_COUNT}
    }
  },
  "redis": {
    "file": "redis.rdb",
    "sha256": "${REDIS_SHA}",
    "bytes": ${REDIS_BYTES},
    "dbsize": ${REDIS_DBSIZE}
  },
  "restoreCommand": "bash scripts/restore-pre-stat-rebalance-v2.sh ${BACKUP_DIR}"
}
EOF

cat > "${BACKUP_DIR}/RESTORE.md" <<EOF
# Stat Rebalance V2 — Geri Donus

Bu klasor **apply oncesi** tam anlik goruntudur (PostgreSQL + Redis).

## Hizli geri yukleme

\`\`\`bash
cd /root/OwlHuntBot
bash scripts/restore-pre-stat-rebalance-v2.sh ${BACKUP_DIR}
\`\`\`

## Ne geri gelir

- Tum baykuslar (146 adet), statlar, traitler, bond
- Oyuncu coin/xp/envanter (PG + Redis hot state)
- RebalanceCompensation kayitlari (su an: ${COMP_COUNT})
- Market / encounter / PvP oturumlari (apply oncesi hali)

## Onemli

- Geri yukleme oncesi script otomatik **guvenlik yedegi** alir.
- PM2 restart komutu script sonunda gosterilir; otomatik baslatilmaz.
- Sadece PG geri yuklemek yetmez; Redis de birlikte restore edilmeli.
EOF

ln -sfn "$(basename "${BACKUP_DIR}")" "${LATEST_LINK}"

echo ""
echo "[6/6] Ozet"
echo "  Klasor : ${BACKUP_DIR}"
echo "  PG     : ${DUMP_BYTES} byte  sha256=${PG_SHA:0:16}..."
echo "  Redis  : ${REDIS_BYTES} byte  sha256=${REDIS_SHA:0:16}..."
echo "  LATEST : ${LATEST_LINK} -> $(readlink "${LATEST_LINK}")"
echo ""
echo "Geri donus:"
echo "  bash scripts/restore-pre-stat-rebalance-v2.sh ${BACKUP_DIR}"
echo ""
echo "Apply icin (yedek hazir olduktan sonra, ayri onay):"
echo "  MIGRATION_CONFIRM=yes BACKUP_MANIFEST=${BACKUP_DIR}/manifest.json \\"
echo "    pnpm tsx scripts/migrate-stat-rebalance-v2.ts --apply"
echo "============================================================"
