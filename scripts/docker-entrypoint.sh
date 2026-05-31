#!/bin/sh
set -e
echo "[Entrypoint] Prisma migrate deploy..."
bunx prisma migrate deploy
echo "[Entrypoint] Bot baslatiliyor..."
exec bun run src/shard-manager.ts
