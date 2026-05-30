#!/usr/bin/env bash
# setup.sh — Ubuntu 24.04 LTS ilk kurulum (Node LTS, PM2, bagimliliklar, bot baslatma)
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

echo "=== OwlHuntBot Kurulumu ==="
echo "Dizin: ${APP_DIR}"

# ── Sistem paketleri ──────────────────────────────────────────────────────────
echo "[1/9] Sistem paketleri guncelleniyor..."
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y

echo "[2/9] Gerekli paketler kuruluyor..."
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  curl ca-certificates gnupg build-essential git

# ── Node.js LTS (NodeSource) ──────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  echo "[3/9] Node.js LTS kuruluyor..."
  curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  echo "[3/9] Node.js zaten kurulu: $(node --version)"
fi

# ── npm guncelle ──────────────────────────────────────────────────────────────
echo "[4/9] npm guncelleniyor..."
sudo npm install -g npm@latest

# ── pnpm (package.json engines gereksinimi) ───────────────────────────────────
echo "[5/9] pnpm etkinlestiriliyor..."
sudo corepack enable
sudo corepack prepare pnpm@latest --activate

# ── PM2 ───────────────────────────────────────────────────────────────────────
if ! command -v pm2 >/dev/null 2>&1; then
  echo "[6/9] PM2 kuruluyor..."
  sudo npm install -g pm2
else
  echo "[6/9] PM2 zaten kurulu: $(pm2 --version)"
fi

# ── Klasorler ─────────────────────────────────────────────────────────────────
echo "[7/9] Klasorler olusturuluyor..."
mkdir -p logs backups
chmod 755 logs backups

# ── Ortam dosyasi ─────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    chmod 600 .env
    echo "UYARI: .env dosyasi .env.example'dan olusturuldu."
    echo "       Lutfen .env icindeki degerleri duzenleyin, sonra:"
    echo "       bash setup.sh  (veya bash start.sh)"
    exit 1
  else
    echo "HATA: .env ve .env.example bulunamadi."
    exit 1
  fi
fi
chmod 600 .env 2>/dev/null || true

# ── Bagimliliklar ve build ────────────────────────────────────────────────────
echo "[8/9] Bagimliliklar kuruluyor ve proje derleniyor..."
pnpm install --frozen-lockfile
pnpm build

# ── PM2 baslat ────────────────────────────────────────────────────────────────
echo "[9/9] Bot PM2 ile baslatiliyor..."
pm2 delete owlhuntbot 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

# Sistem acilisinda otomatik baslat
STARTUP_CMD=$(pm2 startup systemd -u "$USER" --hp "$HOME" | tail -1)
if [[ -n "${STARTUP_CMD}" ]]; then
  eval "${STARTUP_CMD}" || true
fi
pm2 save

echo ""
echo "=== Kurulum tamamlandi ==="
echo "Durum:  pm2 status"
echo "Loglar: pm2 logs owlhuntbot"
echo "Saglik: curl http://localhost:3000/health"
