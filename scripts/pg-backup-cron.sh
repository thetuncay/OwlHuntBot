#!/bin/bash
# pg-backup-cron.sh — Eski betik (uyumluluk)
# Yeni: scripts/cloud-db-backup.sh (bulut append-only, SHA256, Redis)
exec "$(dirname "$0")/cloud-db-backup.sh" "$@"
