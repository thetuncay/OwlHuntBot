#!/usr/bin/env bash
# VDS ilk kurulum — Ubuntu/Debian root veya sudo ile calistir.
# Kullanim: curl -fsSL ... | bash   VEYA   bash scripts/vds-bootstrap.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/owlhuntbot}"
REPO_URL="${REPO_URL:-https://github.com/thetuncay/OwlHuntBot.git}"
BRANCH="${BRANCH:-main}"

echo "==> OwlHuntBot VDS kurulumu (${APP_DIR})"

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Docker kuruluyor..."
  apt-get update -qq
  apt-get install -y ca-certificates curl git
  curl -fsSL https://get.docker.io | sh
  systemctl enable docker
  systemctl start docker
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "HATA: docker compose plugin bulunamadi."
  exit 1
fi

if [ ! -d "${APP_DIR}/.git" ]; then
  echo "==> Repo klonlaniyor..."
  mkdir -p "$(dirname "${APP_DIR}")"
  git clone --branch "${BRANCH}" --depth 1 "${REPO_URL}" "${APP_DIR}"
else
  echo "==> Repo guncelleniyor..."
  cd "${APP_DIR}"
  git fetch origin "${BRANCH}"
  git reset --hard "origin/${BRANCH}"
fi

cd "${APP_DIR}"

if [ ! -f .env ]; then
  echo ""
  echo "============================================================"
  echo "  .env henuz yok."
  echo "  Windows'tan yuklemek icin:"
  echo "    .\\scripts\\deploy-to-vds.ps1 -VdsHost IP -FirstInstall"
  echo "  Veya sunucuda: nano ${APP_DIR}/.env"
  echo "  Sablon: cp .env.production.example .env"
  echo "============================================================"
  exit 0
fi

bash scripts/vds-deploy.sh
