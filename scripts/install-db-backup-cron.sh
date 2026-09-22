#!/usr/bin/env bash
# install-db-backup-cron.sh — saatlik + reboot sonrasi otomatik DB yedek
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_SCRIPT="${ROOT}/scripts/cloud-db-backup.sh"
LOG_FILE="/var/log/owlhunt-db-backup.log"
HOURLY="0 * * * * ${BACKUP_SCRIPT} >> ${LOG_FILE} 2>&1"
REBOOT="@reboot sleep 120 && ${BACKUP_SCRIPT} >> ${LOG_FILE} 2>&1"

chmod +x "${BACKUP_SCRIPT}"
chmod +x "${ROOT}/scripts/restore-from-gdrive.sh" 2>/dev/null || true

touch "${LOG_FILE}"
chmod 640 "${LOG_FILE}"

TMP="$(mktemp)"
crontab -l 2>/dev/null | grep -v "cloud-db-backup.sh" > "${TMP}" || true
echo "${HOURLY}" >> "${TMP}"
echo "${REBOOT}" >> "${TMP}"
crontab "${TMP}"
rm -f "${TMP}"

echo "[cron] Saatlik: ${HOURLY}"
echo "[cron] Reboot:  ${REBOOT}"
echo "[cron] Log: ${LOG_FILE}"
crontab -l | grep cloud-db-backup || true
