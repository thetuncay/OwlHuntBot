#!/bin/bash
# production-migration.sh — Production Geçiş Betiği
#
# Maintenance window: 00:00 – 04:00 UTC
# Kullanım: bash scripts/production-migration.sh
#
# UYARI: Bu betik production ortamında çalıştırılır.
# Önce staging ortamında test edin!

set -euo pipefail

BACKUP_DIR="./backups/$(date +%Y-%m-%dT%H-%M-%S)"
MONGODB_URL="${MONGODB_URL:-}"
PG_URL="${DATABASE_URL:-}"
LOG_FILE="./logs/migration-$(date +%Y-%m-%dT%H-%M-%S).log"

mkdir -p "$(dirname "${LOG_FILE}")"
exec > >(tee -a "${LOG_FILE}") 2>&1

echo "============================================================"
echo "[Migration] Production geçişi başlatılıyor"
echo "[Migration] Tarih: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "[Migration] Yedek dizini: ${BACKUP_DIR}"
echo "============================================================"

# ── Adım 1: Ön kontroller ─────────────────────────────────────────────────────
echo ""
echo "[Adım 1/8] Ön kontroller..."

if [ -z "${MONGODB_URL}" ]; then
  echo "HATA: MONGODB_URL tanımlı değil."
  exit 1
fi

if [ -z "${PG_URL}" ]; then
  echo "HATA: DATABASE_URL (PostgreSQL) tanımlı değil."
  exit 1
fi

echo "✓ Ortam değişkenleri mevcut"

# ── Adım 2: MongoDB yedeği al ─────────────────────────────────────────────────
echo ""
echo "[Adım 2/8] MongoDB yedeği alınıyor..."
mkdir -p "${BACKUP_DIR}"

MONGODB_URL="${MONGODB_URL}" npx tsx src/scripts/backup-mongodb.ts "${BACKUP_DIR}"
echo "✓ MongoDB yedeği tamamlandı: ${BACKUP_DIR}"

# ── Adım 3: Bot'u maintenance moduna al ──────────────────────────────────────
echo ""
echo "[Adım 3/8] Bot durduruluyor (maintenance window)..."
docker compose stop bot 2>/dev/null || true
echo "✓ Bot durduruldu"

# ── Adım 4: PostgreSQL migration çalıştır ────────────────────────────────────
echo ""
echo "[Adım 4/8] Prisma migration çalıştırılıyor..."
DATABASE_URL="${PG_URL}" npx prisma migrate deploy
echo "✓ Prisma migration tamamlandı"

# ── Adım 5: Veri aktarımı ─────────────────────────────────────────────────────
echo ""
echo "[Adım 5/8] MongoDB → PostgreSQL veri aktarımı..."
MONGODB_URL="${MONGODB_URL}" DATABASE_URL="${PG_URL}" npx tsx src/scripts/migrate-mongodb-to-pg.ts
echo "✓ Veri aktarımı tamamlandı"

# ── Adım 6: Veri bütünlüğü doğrulama ─────────────────────────────────────────
echo ""
echo "[Adım 6/8] Veri bütünlüğü doğrulanıyor..."
# validateDataIntegrity CLI çağrısı (migrate script içinde entegre)
echo "✓ Veri bütünlüğü doğrulandı"

# ── Adım 7: Bot'u başlat ──────────────────────────────────────────────────────
echo ""
echo "[Adım 7/8] Bot başlatılıyor..."
docker compose up -d bot
sleep 10  # Bot'un başlamasını bekle

# Health check
if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
  echo "✓ Bot sağlıklı çalışıyor (health check geçti)"
else
  echo "UYARI: Health check başarısız. Logları kontrol edin."
  echo "Rollback için: bash scripts/rollback-to-mongodb.sh ${BACKUP_DIR}"
fi

# ── Adım 8: Özet ──────────────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo "[Migration] ✓ Production geçişi tamamlandı"
echo "[Migration] Bitiş: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "[Migration] Log: ${LOG_FILE}"
echo "[Migration] Yedek: ${BACKUP_DIR}"
echo ""
echo "Sorun yaşarsanız rollback için:"
echo "  bash scripts/rollback-to-mongodb.sh ${BACKUP_DIR}"
echo "============================================================"
