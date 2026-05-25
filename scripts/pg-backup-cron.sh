#!/bin/bash
# pg-backup-cron.sh — Günlük PostgreSQL yedekleme betiği
# Cron: 0 2 * * * /path/to/scripts/pg-backup-cron.sh
#
# NOT (Linux): Bu betiği çalıştırılabilir yapmak için:
#   chmod +x scripts/pg-backup-cron.sh

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/postgresql}"
DB_NAME="${POSTGRES_DB:-owlhuntbot}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
RETENTION_DAYS=7

TIMESTAMP=$(date +"%Y-%m-%dT%H-%M-%S")
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

if pg_dump -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" "${DB_NAME}" | gzip > "${BACKUP_FILE}"; then
  echo "[pg-backup] ✓ Yedekleme tamamlandı: ${BACKUP_FILE}" | logger -t pg-backup
  echo "[pg-backup] ✓ Yedekleme tamamlandı: ${BACKUP_FILE}"
else
  echo "[pg-backup] ✗ Yedekleme başarısız: ${DB_NAME}" | logger -t pg-backup -p user.err
  echo "[pg-backup] ✗ Yedekleme başarısız: ${DB_NAME}" >&2
  exit 1
fi

# 7 günden eski yedekleri sil
find "${BACKUP_DIR}" -name "${DB_NAME}_*.sql.gz" -mtime +${RETENTION_DAYS} -delete
echo "[pg-backup] Eski yedekler temizlendi (>${RETENTION_DAYS} gün)"
