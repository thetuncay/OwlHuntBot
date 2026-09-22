#!/bin/sh
set -e
echo "[Entrypoint] Prisma migrate deploy (dogrudan Postgres)..."
MIGRATE_URL="${DIRECT_DATABASE_URL:-postgresql://postgres@postgres:5432/owlhuntbot}"
DATABASE_URL="${MIGRATE_URL}" bunx prisma migrate deploy
echo "[Entrypoint] Bot baslatiliyor..."
exec bun run src/shard-manager.ts
