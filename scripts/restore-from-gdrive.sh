#!/usr/bin/env bash
# restore-from-gdrive.sh — VDS tamamen kaybolsa bile Drive'dan geri yukleme
#
# Kullanim:
#   bash scripts/restore-from-gdrive.sh --latest
#   bash scripts/restore-from-gdrive.sh --daily 2026-09-02
#   bash scripts/restore-from-gdrive.sh --path daily/2026-09-02

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

REMOTE="${BACKUP_RCLONE_REMOTE:-owlhunt_backup:OwlHuntBot-DB-Backups}"
RESTORE_DIR="${RESTORE_DIR:-./restore-from-cloud}"
MODE="latest"
STAMP=""
CLOUD_PATH=""
DAY_KEY=""

while [ $# -gt 0 ]; do
  case "$1" in
    --latest) MODE="latest"; shift ;;
    --daily) MODE="daily"; DAY_KEY="${2:?--daily YYYY-MM-DD}"; shift 2 ;;
    --stamp) MODE="stamp"; STAMP="${2:?--stamp STAMP}"; shift 2 ;;
    --path) MODE="path"; CLOUD_PATH="${2:?--path gerekli}"; shift 2 ;;
    *) echo "Bilinmeyen: $1" >&2; exit 1 ;;
  esac
done

command -v rclone >/dev/null 2>&1 || { echo "rclone gerekli" >&2; exit 1; }

case "${MODE}" in
  latest) SRC="${REMOTE%/}/latest/" ;;
  daily) SRC="${REMOTE%/}/daily/${DAY_KEY}/" ;;
  stamp) SRC="${REMOTE%/}/${STAMP:0:4}/${STAMP:4:2}/${STAMP:6:2}/${STAMP}/" ;;
  path) SRC="${REMOTE%/}/${CLOUD_PATH}/" ;;
esac

echo "[restore] Indiriliyor: ${SRC}"
rm -rf "${RESTORE_DIR}"
mkdir -p "${RESTORE_DIR}"
rclone copy "${SRC}" "${RESTORE_DIR}/" --checksum --retries 10

MANIFEST="${RESTORE_DIR}/manifest.json"
[ -f "${MANIFEST}" ] || { echo "manifest.json yok" >&2; exit 1; }

PG_FILE="${RESTORE_DIR}/owlhuntbot.dump.gz"
[ -f "${PG_FILE}" ] || { echo "owlhuntbot.dump.gz yok" >&2; exit 1; }

echo "[restore] SHA256 dogrulama..."
sha256sum -c "${PG_FILE}.sha256"

if [ -f "${RESTORE_DIR}/redis.rdb.gz" ] && [ -f "${RESTORE_DIR}/redis.rdb.gz.sha256" ]; then
  sha256sum -c "${RESTORE_DIR}/redis.rdb.gz.sha256"
fi

echo "[restore] PostgreSQL geri yukleme..."
gunzip -c "${PG_FILE}" > "${RESTORE_DIR}/owlhuntbot.dump"
bash scripts/restore-postgres.sh "${RESTORE_DIR}/owlhuntbot.dump"

if [ -f "${RESTORE_DIR}/redis.rdb.gz" ]; then
  echo "[restore] Redis RDB (manuel): gunzip -c ${RESTORE_DIR}/redis.rdb.gz > /tmp/dump.rdb"
  echo "  docker cp /tmp/dump.rdb \$(docker compose ps -q redis):/data/dump.rdb"
  echo "  docker compose restart redis"
fi

echo "[restore] Tamamlandi. Botu baslat: docker compose up -d bot worker"
