#!/usr/bin/env bash
# Node 20 LTS ile uyumlu pnpm surumunu etkinlestirir (pnpm 11+ Node 22 gerektirir).
set -euo pipefail

PNPM_VERSION="${PNPM_VERSION:-9.15.9}"

if ! command -v corepack >/dev/null 2>&1; then
  echo "HATA: corepack bulunamadi. Node.js kurulumunu kontrol edin."
  exit 1
fi

corepack enable
corepack prepare "pnpm@${PNPM_VERSION}" --activate

echo "pnpm $(pnpm --version) (Node $(node --version))"
