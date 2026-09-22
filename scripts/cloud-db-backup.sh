#!/usr/bin/env bash
# cloud-db-backup.sh — PostgreSQL + Redis → Google Drive (VDS'ten bagimsiz, append-only)
#
# Kaynak dogruluk: Google Drive (5TB). VDS yalnizca gecici cache.
# Bulut yuklemesi basarisizsa script HATA ile cikar (BACKUP_REQUIRE_CLOUD=1).
#
# Cron: saatte bir + reboot sonrasi
#   bash scripts/install-db-backup-cron.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

BACKUP_ENABLED="${BACKUP_ENABLED:-1}"
if [ "${BACKUP_ENABLED}" != "1" ] && [ "${BACKUP_ENABLED}" != "true" ]; then
  echo "[backup] BACKUP_ENABLED=${BACKUP_ENABLED} — atlandi"
  exit 0
fi

BACKUP_DIR="${BACKUP_DIR:-/var/backups/owlhuntbot}"
BACKUP_LOCAL_RETENTION_DAYS="${BACKUP_LOCAL_RETENTION_DAYS:-2}"
BACKUP_INCLUDE_REDIS="${BACKUP_INCLUDE_REDIS:-1}"
BACKUP_VERIFY="${BACKUP_VERIFY:-1}"
BACKUP_RCLONE_REMOTE="${BACKUP_RCLONE_REMOTE:-}"
BACKUP_RCLONE_REMOTE_SECONDARY="${BACKUP_RCLONE_REMOTE_SECONDARY:-}"
BACKUP_REQUIRE_CLOUD="${BACKUP_REQUIRE_CLOUD:-1}"
BACKUP_SYNC_RCLONE_CONFIG="${BACKUP_SYNC_RCLONE_CONFIG:-1}"
# Saatlik: sadece latest/. Gunluk: daily/YYYY-MM-DD/ (gunde 1, silinmez)
BACKUP_DAILY_ARCHIVE="${BACKUP_DAILY_ARCHIVE:-1}"
BACKUP_FORCE_DAILY="${BACKUP_FORCE_DAILY:-0}"

DB_NAME="${POSTGRES_DB:-owlhuntbot}"
DB_USER="${POSTGRES_USER:-postgres}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
DAY_KEY="$(date -u +%Y-%m-%d)"
DATE_PATH="$(date -u +%Y/%m/%d)"
WORK_DIR="${BACKUP_DIR}/work-${STAMP}"
ARCHIVE_DIR="${BACKUP_DIR}/archives/${DATE_PATH}/${STAMP}"
LOG_TAG="owlhunt-db-backup"
RCLONE_CONF="${HOME}/.config/rclone/rclone.conf"

log() { echo "[${LOG_TAG}] $*"; }
fail() { log "HATA: $*"; exit 1; }

cloud_required() {
  [ "${BACKUP_REQUIRE_CLOUD}" = "1" ] || [ "${BACKUP_REQUIRE_CLOUD}" = "true" ]
}

has_remote() {
  [ -n "${BACKUP_RCLONE_REMOTE}" ] || [ -n "${BACKUP_RCLONE_REMOTE_SECONDARY}" ]
}

if cloud_required && ! has_remote; then
  fail "BACKUP_REQUIRE_CLOUD=1 ama BACKUP_RCLONE_REMOTE bos — bulut yedek zorunlu"
fi

mkdir -p "${WORK_DIR}" "${ARCHIVE_DIR}"

if ! docker compose exec -T postgres pg_isready -U "${DB_USER}" >/dev/null 2>&1; then
  fail "PostgreSQL hazir degil"
fi

log "PostgreSQL dump basliyor (${STAMP})..."
PG_DUMP="${WORK_DIR}/${DB_NAME}.dump"
docker compose exec -T postgres pg_dump -U "${DB_USER}" -d "${DB_NAME}" -F c > "${PG_DUMP}"

if [ "${BACKUP_VERIFY}" = "1" ] || [ "${BACKUP_VERIFY}" = "true" ]; then
  log "Dump dogrulaniyor (pg_restore --list)..."
  if ! docker compose exec -T postgres pg_restore --list /dev/stdin < "${PG_DUMP}" >/dev/null 2>&1; then
    CONTAINER="$(docker compose ps -q postgres)"
    docker cp "${PG_DUMP}" "${CONTAINER}:/tmp/verify.dump"
    docker compose exec -T postgres pg_restore --list /tmp/verify.dump >/dev/null
    docker compose exec -T postgres rm -f /tmp/verify.dump
  fi
fi

COUNTS="$(docker compose exec -T postgres psql -U "${DB_USER}" -d "${DB_NAME}" -t -A -c \
  "SELECT (SELECT COUNT(*) FROM \"Player\"), (SELECT COUNT(*) FROM \"Owl\"), (SELECT COUNT(*) FROM \"InventoryItem\"), (SELECT COUNT(*) FROM \"MarketListing\");" \
  | tr -d ' \r\n')"
IFS='|' read -r PLAYER_COUNT OWL_COUNT INV_COUNT MARKET_COUNT <<< "${COUNTS}"

log "Satir sayilari: Player=${PLAYER_COUNT} Owl=${OWL_COUNT} Inventory=${INV_COUNT} Market=${MARKET_COUNT}"

gzip -9 "${PG_DUMP}"
PG_GZ="${PG_DUMP}.gz"
sha256sum "${PG_GZ}" > "${PG_GZ}.sha256"
PG_BYTES="$(wc -c < "${PG_GZ}" | tr -d ' ')"
PG_SHA="$(cut -d' ' -f1 "${PG_GZ}.sha256")"

REDIS_FILE=""
REDIS_BYTES=0
REDIS_SHA="null"
if [ "${BACKUP_INCLUDE_REDIS}" = "1" ] || [ "${BACKUP_INCLUDE_REDIS}" = "true" ]; then
  if [ -n "${REDIS_PASSWORD:-}" ] && docker compose ps -q redis >/dev/null 2>&1; then
    log "Redis BGSAVE..."
    docker compose exec -T redis redis-cli -a "${REDIS_PASSWORD}" --no-auth-warning BGSAVE >/dev/null || true
    for _ in $(seq 1 30); do
      STATUS="$(docker compose exec -T redis redis-cli -a "${REDIS_PASSWORD}" --no-auth-warning INFO persistence 2>/dev/null | grep rdb_bgsave_in_progress | cut -d: -f2 | tr -d ' \r\n' || echo 1)"
      [ "${STATUS}" = "0" ] && break
      sleep 1
    done
    REDIS_CONTAINER="$(docker compose ps -q redis)"
    REDIS_FILE="${WORK_DIR}/redis.rdb"
    docker cp "${REDIS_CONTAINER}:/data/dump.rdb" "${REDIS_FILE}" 2>/dev/null || REDIS_FILE=""
    if [ -n "${REDIS_FILE}" ] && [ -f "${REDIS_FILE}" ]; then
      gzip -9 "${REDIS_FILE}"
      REDIS_FILE="${REDIS_FILE}.gz"
      sha256sum "${REDIS_FILE}" > "${REDIS_FILE}.sha256"
      REDIS_BYTES="$(wc -c < "${REDIS_FILE}" | tr -d ' ')"
      REDIS_SHA="\"$(cut -d' ' -f1 "${REDIS_FILE}.sha256")\""
      log "Redis yedeklendi (${REDIS_BYTES} byte)"
    else
      log "Redis dump alinamadi (atlandi)"
      REDIS_FILE=""
    fi
  fi
fi

MANIFEST="${WORK_DIR}/manifest.json"
cat > "${MANIFEST}" <<EOF
{
  "version": 2,
  "timestampUtc": "${STAMP}",
  "datePath": "${DATE_PATH}",
  "database": "${DB_NAME}",
  "postgres": {
    "file": "$(basename "${PG_GZ}")",
    "sha256": "${PG_SHA}",
    "bytes": ${PG_BYTES}
  },
  "redis": {
    "file": $(if [ -n "${REDIS_FILE}" ]; then echo "\"$(basename "${REDIS_FILE}")\""; else echo "null"; fi),
    "sha256": ${REDIS_SHA},
    "bytes": ${REDIS_BYTES}
  },
  "counts": {
    "players": ${PLAYER_COUNT:-0},
    "owls": ${OWL_COUNT:-0},
    "inventoryItems": ${INV_COUNT:-0},
    "marketListings": ${MARKET_COUNT:-0}
  },
  "host": "$(hostname -f 2>/dev/null || hostname)",
  "immutable": true,
  "cloudPath": "latest",
  "dayKey": "${DAY_KEY}"
}
EOF

# VDS olmeden once Drive'dan restore icin kisa rehber (her yedekte guncel kopya)
cat > "${WORK_DIR}/RESTORE.md" <<'RESTORE'
# OwlHunt — VDS'siz geri yukleme (Google Drive)

Bu klasordeki dosyalar VDS'ten bagimsizdir. Yeni sunucuda:

```bash
git clone https://github.com/thetuncay/OwlHuntBot.git && cd OwlHuntBot
bash scripts/setup-gdrive-backup.sh --token '<oauth_token>'
bash scripts/restore-from-gdrive.sh --latest
docker compose up -d
```

Manuel: `rclone copy REMOTE:latest/ ./restore/` → `gunzip -c restore/owlhuntbot.dump.gz | ...`
RESTORE

cp -a "${WORK_DIR}/." "${ARCHIVE_DIR}/"
LATEST_LINK="${BACKUP_DIR}/LATEST"
rm -f "${LATEST_LINK}"
ln -s "${ARCHIVE_DIR}" "${LATEST_LINK}"

CLOUD_OK=0

upload_remote() {
  local remote="$1"
  local label="$2"
  [ -n "${remote}" ] || return 0
  command -v rclone >/dev/null 2>&1 || fail "rclone yok"

  local latest="${remote%/}/latest"
  local daily="${remote%/}/daily/${DAY_KEY}"
  local meta="${remote%/}/_meta"

  # 1) latest/ — tek guncel kopya (saatlik buraya yazar; once temizle)
  log "latest/ guncelleniyor (${label})"
  rclone purge "${latest}/" 2>/dev/null || true
  rclone copy "${ARCHIVE_DIR}/" "${latest}/" \
    --retries 10 \
    --low-level-retries 15 \
    --checksum \
    --stats-one-line

  log "Bulut dogrulama latest/ (${label})..."
  if ! rclone check "${ARCHIVE_DIR}/" "${latest}/" --one-way --checksum >/dev/null 2>&1; then
    fail "Bulut dogrulama basarisiz (${label}): ${latest}"
  fi

  # 2) daily/YYYY-MM-DD — gunde bir (yoksa yaz; silinmez)
  if [ "${BACKUP_DAILY_ARCHIVE}" = "1" ] || [ "${BACKUP_DAILY_ARCHIVE}" = "true" ]; then
    local need_daily=0
    if [ "${BACKUP_FORCE_DAILY}" = "1" ]; then
      need_daily=1
    elif ! rclone lsf "${daily}/" --files-only 2>/dev/null | grep -q 'owlhuntbot.dump.gz'; then
      need_daily=1
    fi
    if [ "${need_daily}" -eq 1 ]; then
      log "Gunluk arsiv (${label}): ${daily}"
      rclone copy "${ARCHIVE_DIR}/" "${daily}/" \
        --retries 10 \
        --checksum \
        --stats-one-line
    else
      log "Gunluk arsiv zaten var (${DAY_KEY}) — atlandi"
    fi
  fi

  rclone copyto "${MANIFEST}" "${meta}/last-success.json" --checksum 2>/dev/null || true
  echo "{\"stamp\":\"${STAMP}\",\"day\":\"${DAY_KEY}\",\"pgBytes\":${PG_BYTES},\"at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" \
    | rclone rcat "${meta}/history.jsonl" 2>/dev/null || true

  if [ "${BACKUP_SYNC_RCLONE_CONFIG}" = "1" ] && [ -f "${RCLONE_CONF}" ]; then
    rclone copyto "${RCLONE_CONF}" "${meta}/rclone.conf.backup" --checksum 2>/dev/null || true
  fi

  log "Bulut yedek OK (${label}): latest/ + daily/${DAY_KEY}"
  CLOUD_OK=1
}

upload_remote "${BACKUP_RCLONE_REMOTE}" "primary"
upload_remote "${BACKUP_RCLONE_REMOTE_SECONDARY}" "secondary"

if cloud_required && [ "${CLOUD_OK}" -eq 0 ]; then
  fail "Bulut yedek zorunlu ama yukleme yapilamadi"
fi

if ! cloud_required && ! has_remote; then
  log "UYARI: Bulut remote yok — yalnizca yerel: ${ARCHIVE_DIR}"
fi

# VDS cache: kisa tutulur; asil arsiv Drive'da
find "${BACKUP_DIR}/work-"* -maxdepth 0 -type d -mtime +1 -exec rm -rf {} + 2>/dev/null || true
if [ "${BACKUP_LOCAL_RETENTION_DAYS}" -gt 0 ] 2>/dev/null; then
  find "${BACKUP_DIR}/archives" -type f -mtime +"${BACKUP_LOCAL_RETENTION_DAYS}" -delete 2>/dev/null || true
  find "${BACKUP_DIR}/archives" -type d -empty -delete 2>/dev/null || true
fi

log "Tamamlandi: bulut=${CLOUD_OK} yerel=${ARCHIVE_DIR} PG=${PG_BYTES}B"
