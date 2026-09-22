#!/usr/bin/env bash
# setup-gdrive-backup.sh — Google Drive (5TB) append-only DB yedek
#
# Ilk kurulum (Windows/Mac — tarayicili makine):
#   rclone authorize "drive" "eyJzY29wZSI6ImRyaXZlIn0"
#   → cikan JSON token'i kopyala
#
# VDS'te token ile bagla:
#   bash scripts/setup-gdrive-backup.sh --token 'PASTE_JSON_HERE'
#   bash scripts/cloud-db-backup.sh
#
# veya token dosyasi:
#   bash scripts/setup-gdrive-backup.sh --token-file ./gdrive-token.json

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${ROOT}/.env"
RCLONE_CONF="${HOME}/.config/rclone/rclone.conf"
REMOTE_NAME="owlhunt_backup"
DRIVE_FOLDER="OwlHuntBot-DB-Backups"
AUTH_CMD='rclone authorize "drive" "eyJzY29wZSI6ImRyaXZlIn0"'

set_env_var() {
  local key="$1"
  local val="$2"
  touch "${ENV_FILE}"
  if grep -q "^${key}=" "${ENV_FILE}" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" "${ENV_FILE}"
  else
    echo "${key}=${val}" >> "${ENV_FILE}"
  fi
  echo "[gdrive] .env → ${key}=${val}"
}

apply_token() {
  local token="$1"
  mkdir -p "$(dirname "${RCLONE_CONF}")"

  rclone config delete "${REMOTE_NAME}" 2>/dev/null || true
  rclone config create "${REMOTE_NAME}" drive \
    scope drive \
    config_is_local false \
    config_token "${token}" \
    --non-interactive 2>/dev/null || true

  # Eski rclone surumleri team_drive=false yazarsa kaldir (Shared drive hatasi)
  if grep -q '^team_drive = false' "${RCLONE_CONF}" 2>/dev/null; then
    sed -i '/^team_drive = false/d' "${RCLONE_CONF}"
  fi

  echo "[gdrive] Drive klasoru kontrol: ${DRIVE_FOLDER}"
  rclone mkdir "${REMOTE_NAME}:${DRIVE_FOLDER}" 2>/dev/null || true

  set_env_var "BACKUP_RCLONE_REMOTE" "${REMOTE_NAME}:${DRIVE_FOLDER}"
  set_env_var "BACKUP_ENABLED" "1"
  set_env_var "BACKUP_INCLUDE_REDIS" "1"
  set_env_var "BACKUP_VERIFY" "1"

  echo "[gdrive] Baglanti testi..."
  rclone lsd "${REMOTE_NAME}:" | head -5
  echo "[gdrive] Hazir. Ilk yedek: bash scripts/cloud-db-backup.sh"
}

read_token_file() {
  local file="$1"
  if [ ! -f "${file}" ]; then
    echo "HATA: Dosya yok: ${file}" >&2
    exit 1
  fi
  tr -d '\n' < "${file}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
}

case "${1:-}" in
  --token)
    [ -n "${2:-}" ] || { echo "Kullanim: $0 --token '<json>'" >&2; exit 1; }
    apply_token "$2"
    ;;
  --token-file)
    [ -n "${2:-}" ] || { echo "Kullanim: $0 --token-file ./token.json" >&2; exit 1; }
    apply_token "$(read_token_file "$2")"
    ;;
  --apply-env)
    if [ ! -f "${RCLONE_CONF}" ] || ! grep -q "^\[${REMOTE_NAME}\]" "${RCLONE_CONF}"; then
      echo "HATA: rclone remote '${REMOTE_NAME}' yok. Once --token ile bagla." >&2
      exit 1
    fi
    set_env_var "BACKUP_RCLONE_REMOTE" "${REMOTE_NAME}:${DRIVE_FOLDER}"
    set_env_var "BACKUP_ENABLED" "1"
    ;;
  *)
    cat <<EOF
Google Drive DB yedek kurulumu (5TB alaniniz)
=============================================

1) Kendi bilgisayarinizda (Chrome olan Windows/Mac/Linux) rclone kurulu olmali.
   Ayni surum onerilir: $(rclone version | head -1)

2) Tarayicili makinede calistirin:

   ${AUTH_CMD}

3) Google hesabinizla giris yapin → "rclone" erisimine izin verin.
   Terminalde JSON token gorunecek (tek satir veya blok). TAMAMINI kopyalayin.

4) VDS'te yapiskan:

   bash scripts/setup-gdrive-backup.sh --token '<JSON_TOKEN>'

5) Ilk bulut yedegi:

   bash scripts/cloud-db-backup.sh

NOT: Script buluttan hicbir sey silmez. Klasor: Drive / ${DRIVE_FOLDER} /
EOF
    ;;
esac
