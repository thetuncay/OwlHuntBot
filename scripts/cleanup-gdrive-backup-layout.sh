#!/usr/bin/env bash
# cleanup-gdrive-backup-layout.sh — Eski stamp klasorlerini temizle, temiz layout'a gec
#
# Hedef yapi:
#   OwlHuntBot-DB-Backups/
#     latest/           ← tek guncel
#     daily/YYYY-MM-DD/ ← gunde 1 (silinmez)
#     _meta/
#
# Eski: 2026/09/02/stamp/ klasorleri silinir (latest + daily korunur).

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
DAY_KEY="$(date -u +%Y-%m-%d)"
KEEP_STAMP="${1:-}"

echo "[cleanup] Remote: ${REMOTE}"
echo "[cleanup] latest/ korunacak; daily/${DAY_KEY}/ olusturulacak; eski stamp klasorleri silinecek"

# latest yoksa en yeni stamp'ten doldur
if ! rclone lsf "${REMOTE%/}/latest/" --files-only 2>/dev/null | grep -q 'owlhuntbot.dump.gz'; then
  echo "[cleanup] latest/ bos — once backup calistir"
  BACKUP_FORCE_DAILY=1 bash scripts/cloud-db-backup.sh
fi

# daily bugun yoksa latest'ten kopyala
if ! rclone lsf "${REMOTE%/}/daily/${DAY_KEY}/" --files-only 2>/dev/null | grep -q 'owlhuntbot.dump.gz'; then
  echo "[cleanup] daily/${DAY_KEY}/ olusturuluyor (latest'ten)"
  rclone copy "${REMOTE%/}/latest/" "${REMOTE%/}/daily/${DAY_KEY}/" --checksum --retries 5
fi

# Eski yil klasoru (2026/...) stamp layout — tamamen kaldir
echo "[cleanup] Eski stamp agaci siliniyor: ${REMOTE%/}/2026/"
rclone purge "${REMOTE%/}/2026/" 2>/dev/null || true

echo "[cleanup] Son yapi:"
rclone lsd "${REMOTE%/}/" 2>/dev/null || true
rclone lsd "${REMOTE%/}/daily/" 2>/dev/null || true
rclone ls "${REMOTE%/}/latest/" 2>/dev/null || true

echo "[cleanup] Tamam. Bundan sonra saatlik yedek sadece latest/ yazar; gunluk arsiv gunde 1."
