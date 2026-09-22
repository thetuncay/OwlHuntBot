#!/usr/bin/env bash
# setup-rclone-backup.sh — Ucretsiz bulut yedek (Backblaze B2 / Google Drive) kurulumu
#
# Backblaze B2: 10 GB ucretsiz, silme politikasi panelden KAPALI tutulmali.
# Google Drive: 5TB+ kisisel alan (onerilen — sizin hesap)
#   bash scripts/setup-gdrive-backup.sh
#   (token adimlari ekranda; sonra --token ile bagla)
#   bash scripts/setup-gdrive-backup.sh --token '<json>'
#
# Kullanim:
#   bash scripts/setup-rclone-backup.sh
#   bash scripts/setup-rclone-backup.sh --b2   # B2 env ile otomatik config
#   bash scripts/setup-rclone-backup.sh --gdrive  # interaktif Google Drive

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${ROOT}/.env"
RCLONE_CONF="${HOME}/.config/rclone/rclone.conf"
REMOTE_NAME="owlhunt_backup"

install_rclone() {
  if command -v rclone >/dev/null 2>&1; then
    echo "[setup] rclone mevcut: $(rclone version | head -1)"
    return
  fi
  echo "[setup] rclone kuruluyor..."
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq rclone
}

append_env() {
  local key="$1"
  local val="$2"
  if grep -q "^${key}=" "${ENV_FILE}" 2>/dev/null; then
    return
  fi
  echo "${key}=${val}" >> "${ENV_FILE}"
  echo "[setup] .env eklendi: ${key}"
}

setup_b2() {
  : "${B2_ACCOUNT_ID:?B2_ACCOUNT_ID gerekli}"
  : "${B2_APPLICATION_KEY:?B2_APPLICATION_KEY gerekli}"
  : "${B2_BUCKET:?B2_BUCKET gerekli}"

  mkdir -p "$(dirname "${RCLONE_CONF}")"
  if ! grep -q "^\[${REMOTE_NAME}\]" "${RCLONE_CONF}" 2>/dev/null; then
    cat >> "${RCLONE_CONF}" <<EOF

[${REMOTE_NAME}]
type = b2
account = ${B2_ACCOUNT_ID}
key = ${B2_APPLICATION_KEY}
hard_delete = false
EOF
  fi

  append_env "BACKUP_RCLONE_REMOTE" "b2:${B2_BUCKET}/owlhunt-db"
  append_env "BACKUP_ENABLED" "1"
  append_env "BACKUP_INCLUDE_REDIS" "1"
  append_env "BACKUP_VERIFY" "1"
  echo "[setup] B2 remote: b2:${B2_BUCKET}/owlhunt-db"
  echo "[setup] B2 bucket'ta Lifecycle / auto-delete KAPALI olmali."
}

setup_gdrive_interactive() {
  exec bash "$(dirname "$0")/setup-gdrive-backup.sh" "${@:2}"
}

install_rclone

case "${1:-}" in
  --b2)
    setup_b2
    ;;
  --gdrive)
    setup_gdrive_interactive
    ;;
  *)
    cat <<'HELP'
OwlHunt bulut DB yedek kurulumu
================================

1) Backblaze B2 (onerilen — 10GB ucretsiz, append-only):
   export B2_ACCOUNT_ID=...
   export B2_APPLICATION_KEY=...
   export B2_BUCKET=owlhunt-backups
   bash scripts/setup-rclone-backup.sh --b2

2) Google Drive (5TB — kisisel hesap):
   bash scripts/setup-gdrive-backup.sh
   # token alindiktan sonra:
   bash scripts/setup-gdrive-backup.sh --token '<JSON>'

3) Cron kur:
   bash scripts/install-db-backup-cron.sh

4) Ilk yedek:
   bash scripts/cloud-db-backup.sh

ONEMLI: Bulutta otomatik silme / lifecycle KAPALI. Yedekler yalnizca eklenir, script uzaktan hicbir sey silmez.
HELP
    ;;
esac
