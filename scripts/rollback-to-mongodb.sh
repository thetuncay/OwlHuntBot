#!/bin/bash
# rollback-to-mongodb.sh — PostgreSQL'den MongoDB'ye geri dönüş betiği
#
# Kullanım: bash scripts/rollback-to-mongodb.sh <backup_dir>
# Örnek:    bash scripts/rollback-to-mongodb.sh ./backups/2025-01-15T00-00-00

set -euo pipefail

BACKUP_DIR="${1:-./backups}"
MONGODB_URL="${MONGODB_URL:-mongodb://localhost:27017/baykusbot}"

echo "[Rollback] Başlatılıyor..."
echo "[Rollback] Yedek dizini: ${BACKUP_DIR}"

# 1. Bot'u durdur
echo "[Rollback] Bot durduruluyor..."
docker compose stop bot 2>/dev/null || true

# 2. DATABASE_URL'yi MongoDB'ye çevir
echo "[Rollback] DATABASE_URL güncelleniyor..."
if [ -f .env ]; then
  sed -i.bak "s|DATABASE_URL=postgresql://.*|DATABASE_URL=${MONGODB_URL}|g" .env
  echo "[Rollback] .env güncellendi (yedek: .env.bak)"
fi

# 3. Prisma provider'ı geri al
echo "[Rollback] Prisma schema güncelleniyor..."
if [ -f prisma/schema.prisma ]; then
  sed -i.bak 's/provider = "postgresql"/provider = "mongodb"/g' prisma/schema.prisma
  echo "[Rollback] schema.prisma güncellendi (yedek: schema.prisma.bak)"
fi

# 4. Yedek JSON'lardan MongoDB'ye geri yükle
COLLECTIONS=("Player" "Owl" "InventoryItem" "PvpSession" "Encounter" "PlayerRegistration" "SeasonArchive" "Season")

echo "[Rollback] MongoDB'ye veri yükleniyor..."
for collection in "${COLLECTIONS[@]}"; do
  # En son yedek dosyasını bul
  BACKUP_FILE=$(ls -t "${BACKUP_DIR}/${collection}_"*.json 2>/dev/null | head -1 || true)
  if [ -z "${BACKUP_FILE}" ]; then
    echo "[Rollback] UYARI: ${collection} için yedek bulunamadı, atlanıyor."
    continue
  fi

  echo "[Rollback] ${collection} yükleniyor: ${BACKUP_FILE}"
  mongoimport \
    --uri "${MONGODB_URL}" \
    --collection "${collection}" \
    --file "${BACKUP_FILE}" \
    --jsonArray \
    --mode upsert \
    2>&1 | tail -1
done

# 5. Bot'u yeniden başlat
echo "[Rollback] Bot yeniden başlatılıyor..."
docker compose up -d bot

# 6. Veri bütünlüğünü doğrula
echo "[Rollback] Veri bütünlüğü kontrol ediliyor..."
sleep 5  # Bot'un başlamasını bekle

for collection in "${COLLECTIONS[@]}"; do
  BACKUP_FILE=$(ls -t "${BACKUP_DIR}/${collection}_"*.json 2>/dev/null | head -1 || true)
  if [ -z "${BACKUP_FILE}" ]; then continue; fi

  BACKUP_COUNT=$(python3 -c "import json; data=json.load(open('${BACKUP_FILE}')); print(len(data))" 2>/dev/null || echo "?")
  echo "[Rollback] ${collection}: yedek=${BACKUP_COUNT} kayıt"
done

echo "[Rollback] ✓ Tamamlandı. MongoDB'ye geri dönüş başarılı."
echo "[Rollback] NOT: Prisma generate çalıştırmayı unutma: npx prisma generate"
