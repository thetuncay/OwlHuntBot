/**
 * leaderboard-migrate-keys.ts — ZSET rebuild + legacy key migration
 *
 * Usage:
 *   pnpm migrate:leaderboard -- --rebuild-only
 *   pnpm migrate:leaderboard -- --dry-run
 *   pnpm migrate:leaderboard -- --guild GUILD_ID
 */
import '../env';
import { PrismaClient } from '@prisma/client';
import { redis } from '../utils/redis';
import { backfillLeaderboardStats } from '../systems/leaderboard';
import {
  rebuildAllLeaderboardZsets,
  rebuildGuildScopeFromRegistrations,
} from '../systems/leaderboard-rebuild';

function parseArgs(): { rebuildOnly: boolean; dryRun: boolean; guildId?: string } {
  const args = process.argv.slice(2);
  return {
    rebuildOnly: args.includes('--rebuild-only'),
    dryRun: args.includes('--dry-run'),
    guildId: args.includes('--guild') ? args[args.indexOf('--guild') + 1] : undefined,
  };
}

async function main(): Promise<void> {
  const opts = parseArgs();
  const prisma = new PrismaClient();
  await prisma.$connect();
  await redis.ping();

  console.info('[LeaderboardMigrate] dryRun=%s rebuildOnly=%s', opts.dryRun, opts.rebuildOnly);

  if (opts.dryRun) {
    const count = await prisma.player.count();
    console.info('[LeaderboardMigrate] Would rebuild ZSETs for %d players', count);
    await redis.quit();
    await prisma.$disconnect();
    return;
  }

  if (!opts.rebuildOnly) {
    const { updated } = await backfillLeaderboardStats(prisma, redis);
    console.info('[LeaderboardMigrate] backfillLeaderboardStats: %d players', updated);
  }

  const global = await rebuildAllLeaderboardZsets(redis, prisma, { includeLegacy: true });
  console.info('[LeaderboardMigrate] global rebuild keys=%d members~=%d', global.keys, global.members);

  if (opts.guildId) {
    const n = await rebuildGuildScopeFromRegistrations(redis, prisma, opts.guildId);
    console.info('[LeaderboardMigrate] guild %s entries=%d', opts.guildId, n);
  }

  await redis.quit();
  await prisma.$disconnect();
  console.info('[LeaderboardMigrate] Done');
}

void main().catch((err) => {
  console.error('[LeaderboardMigrate] Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
