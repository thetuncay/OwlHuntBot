#!/usr/bin/env tsx
/**
 * Stat Rebalance V2 migration — hard rebalance tüm oyuncular.
 *
 *   pnpm tsx scripts/migrate-stat-rebalance-v2.ts --dry-run
 *   pnpm tsx scripts/migrate-stat-rebalance-v2.ts --apply   (bot kapalı olmalı)
 */

import { PrismaClient } from '@prisma/client';
import {
  OWL_BASE_HP,
  OWL_BASE_STAMINA,
} from '../src/config';
import {
  buildOwlStatWriteData,
  getAvgEffectiveStat,
  getEffectiveStats,
  rollBaseStatsForTier,
} from '../src/utils/owl-stats';
import {
  computeCompensationPayload,
  compensationExpiresAt,
  type CompensationSnapshot,
} from '../src/systems/rebalance-compensation';

const prisma = new PrismaClient();

interface DryRunRow {
  playerId: string;
  avgEffective: number;
  species: string;
  tier: number;
  coins: number;
  lootboxes: number;
}

async function forceCancelListingsTx(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  playerId: string,
): Promise<number> {
  const r = await tx.marketListing.updateMany({
    where: { sellerId: playerId, status: 'active' },
    data: { status: 'cancelled' },
  });
  return r.count;
}

async function migratePlayer(playerId: string, apply: boolean): Promise<DryRunRow | null> {
  const main = await prisma.owl.findFirst({
    where: { ownerId: playerId, isMain: true },
    select: {
      id: true,
      species: true,
      tier: true,
      quality: true,
      nickname: true,
      statGaga: true,
      statGoz: true,
      statKulak: true,
      statKanat: true,
      statPence: true,
    },
  });
  if (!main) return null;

  const avgEffective = getAvgEffectiveStat(main);
  const effective = getEffectiveStats(main);
  const payload = computeCompensationPayload(avgEffective);
  const snapshot: CompensationSnapshot = {
    species: main.species,
    tier: main.tier,
    quality: main.quality,
    avgEffective,
    stats: effective,
  };

  const row: DryRunRow = {
    playerId,
    avgEffective: Math.round(avgEffective * 10) / 10,
    species: main.species,
    tier: main.tier,
    coins: payload.coins,
    lootboxes: payload.items.find((i) => i.itemName === 'Eşya Kutusu')?.quantity ?? 0,
  };

  if (!apply) return row;

  const baseStats = rollBaseStatsForTier(main.tier);
  const statData = buildOwlStatWriteData(baseStats);
  const hp = OWL_BASE_HP[main.tier] ?? 100;
  const stamina = OWL_BASE_STAMINA[main.tier] ?? 100;

  await prisma.$transaction(async (tx) => {
    await forceCancelListingsTx(tx, playerId);
    await tx.encounter.updateMany({
      where: { playerId, status: 'open' },
      data: { status: 'closed' },
    });
    await tx.pvpSession.updateMany({
      where: {
        status: 'active',
        OR: [{ challengerId: playerId }, { defenderId: playerId }],
      },
      data: { status: 'cancelled' },
    });

    await tx.owl.deleteMany({ where: { ownerId: playerId } });

    const newMain = await tx.owl.create({
      data: {
        ownerId: playerId,
        species: main.species,
        tier: main.tier,
        quality: 'Common',
        nickname: main.nickname,
        hp,
        hpMax: hp,
        staminaCur: stamina,
        isMain: true,
        ...statData,
      },
    });

    await tx.player.update({
      where: { id: playerId },
      data: { mainOwlId: newMain.id },
    });

    await tx.rebalanceCompensation.upsert({
      where: { playerId },
      create: {
        playerId,
        payload,
        snapshot,
        expiresAt: compensationExpiresAt(),
      },
      update: {
        payload,
        snapshot,
        expiresAt: compensationExpiresAt(),
        claimedAt: null,
      },
    });

    await tx.auditLog.create({
      data: {
        playerId,
        action: 'stat_rebalance_v2',
        before: snapshot as object,
        after: { newMainId: newMain.id, baseStats } as object,
      },
    });
  });

  return row;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const dryRun = process.argv.includes('--dry-run') || !apply;

  if (apply && process.env.MIGRATION_CONFIRM !== 'yes') {
    console.error('Apply icin: MIGRATION_CONFIRM=yes pnpm tsx scripts/migrate-stat-rebalance-v2.ts --apply');
    process.exit(1);
  }

  if (apply) {
    const manifestPath = process.env.BACKUP_MANIFEST;
    if (!manifestPath) {
      console.error(
        'Apply icin on-apply yedek zorunlu. Once:\n'
        + '  bash scripts/backup-pre-stat-rebalance-v2.sh\n'
        + 'Sonra:\n'
        + '  MIGRATION_CONFIRM=yes BACKUP_MANIFEST=./backups/pre-stat-rebalance-v2-.../manifest.json \\',
      );
      console.error('    pnpm tsx scripts/migrate-stat-rebalance-v2.ts --apply');
      process.exit(1);
    }
    const fs = await import('node:fs');
    if (!fs.existsSync(manifestPath)) {
      console.error(`BACKUP_MANIFEST bulunamadi: ${manifestPath}`);
      process.exit(1);
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      label?: string;
      postgres?: { counts?: { rebalanceCompensation?: number } };
    };
    if (manifest.label !== 'pre-stat-rebalance-v2') {
      console.error('BACKUP_MANIFEST gecersiz label (pre-stat-rebalance-v2 bekleniyor)');
      process.exit(1);
    }
    const compInBackup = manifest.postgres?.counts?.rebalanceCompensation ?? -1;
    const compNow = await prisma.rebalanceCompensation.count();
    if (compNow > 0) {
      console.error(`RebalanceCompensation zaten ${compNow} kayit — migration daha once uygulanmis olabilir.`);
      process.exit(1);
    }
    console.error(`[preflight] Yedek manifest OK (backup compensation=${compInBackup}, db now=${compNow})`);
  }

  const players = await prisma.player.findMany({ select: { id: true } });
  const rows: DryRunRow[] = [];
  let totalCoins = 0;

  for (const p of players) {
    const row = await migratePlayer(p.id, apply);
    if (row) {
      rows.push(row);
      totalCoins += row.coins;
    }
  }

  rows.sort((a, b) => b.avgEffective - a.avgEffective);

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    playerCount: rows.length,
    totalCompensationCoins: totalCoins,
    top5: rows.slice(0, 5),
    bottom5: rows.slice(-5),
  }, null, 2));

  if (dryRun && !apply) {
    console.log('\nDry-run tamam. Apply icin botu durdurup MIGRATION_CONFIRM=yes ile --apply calistir.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
