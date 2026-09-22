/**
 * Admin one-shot: verilen oyuncuya katalogdaki her itemden 1 adet.
 */
import { PrismaClient } from '@prisma/client';
import {
  PREY,
  HUNT_ITEM_DROPS,
  BUFF_ITEMS,
  LOOTBOX_DEFS,
  OWL_SPECIES,
  OWL_BASE_HP,
  OWL_BASE_STAMINA,
} from '../src/config';
import { RUNE_DEFS, RUNE_ITEM_TYPE, RUNE_RARITY_TO_INVENTORY } from '../src/config/runes';
import { resolveDatabaseUrl } from '../src/env';
import { redis, assertRedisConnection } from '../src/utils/redis';
import { mirrorInventoryFromPg } from '../src/state/player-state';
import { buildOwlStatWriteData } from '../src/utils/owl-stats';

const PLAYER_ID = process.argv[2]?.trim() || '1110219662509224006';

function preyRarity(difficulty: number): string {
  if (difficulty >= 7) return 'Rare';
  if (difficulty >= 4) return 'Uncommon';
  return 'Common';
}

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    datasources: { db: { url: resolveDatabaseUrl('bot') } },
  });

  await assertRedisConnection();
  const player = await prisma.player.findUnique({ where: { id: PLAYER_ID } });
  if (!player) {
    console.error(`Oyuncu kayıtlı değil: ${PLAYER_ID}`);
    process.exit(1);
  }

  const grants: Array<{ itemName: string; itemType: string; rarity: string }> = [
    ...PREY.map((p) => ({
      itemName: p.name,
      itemType: 'Av',
      rarity: preyRarity(p.difficulty),
    })),
    ...HUNT_ITEM_DROPS.map((m) => ({
      itemName: m.itemName,
      itemType: m.itemType,
      rarity: m.rarity,
    })),
    ...BUFF_ITEMS.map((b) => ({
      itemName: b.name,
      itemType: 'Buff',
      rarity: b.rarity,
    })),
    ...LOOTBOX_DEFS.map((l) => ({
      itemName: l.name,
      itemType: 'Lootbox',
      rarity: 'Rare',
    })),
    ...RUNE_DEFS.map((r) => ({
      itemName: r.name,
      itemType: RUNE_ITEM_TYPE,
      rarity: RUNE_RARITY_TO_INVENTORY[r.rarity],
    })),
  ];

  for (const g of grants) {
    await prisma.inventoryItem.upsert({
      where: { ownerId_itemName: { ownerId: PLAYER_ID, itemName: g.itemName } },
      create: {
        ownerId: PLAYER_ID,
        itemName: g.itemName,
        itemType: g.itemType,
        rarity: g.rarity,
        quantity: 1,
      },
      update: { quantity: { increment: 1 } },
    });
  }

  await mirrorInventoryFromPg(redis, prisma, PLAYER_ID);

  for (const p of PREY) {
    await prisma.playerPreyDex.upsert({
      where: { playerId_preyName: { playerId: PLAYER_ID, preyName: p.name } },
      create: { playerId: PLAYER_ID, preyName: p.name, totalCaught: 1 },
      update: { totalCaught: { increment: 1 } },
    });
  }
  await redis.sadd(`preydex:seen:${PLAYER_ID}`, ...PREY.map((p) => p.name));

  const existingOwls = await prisma.owl.findMany({
    where: { ownerId: PLAYER_ID },
    select: { species: true, isMain: true },
  });
  const ownedSpecies = new Set(existingOwls.map((o) => o.species));
  const hasMain = existingOwls.some((o) => o.isMain);
  let createdOwls = 0;

  for (const species of OWL_SPECIES) {
    if (ownedSpecies.has(species.name)) continue;
    const hp = OWL_BASE_HP[species.tier] ?? 100;
    const stamina = OWL_BASE_STAMINA[species.tier] ?? 100;
    await prisma.owl.create({
      data: {
        ownerId: PLAYER_ID,
        species: species.name,
        tier: species.tier,
        quality: 'Common',
        hp,
        hpMax: hp,
        staminaCur: stamina,
        isMain: !hasMain && createdOwls === 0,
        effectiveness: 100,
        ...buildOwlStatWriteData({ gaga: 5, goz: 5, kulak: 5, kanat: 5, pence: 5 }),
      },
    });
    createdOwls += 1;
  }

  const invCount = await prisma.inventoryItem.count({ where: { ownerId: PLAYER_ID } });
  const owlCount = await prisma.owl.count({ where: { ownerId: PLAYER_ID } });
  console.log(
    `OK ${PLAYER_ID} grants=${grants.length} inventoryRows=${invCount} owlsCreated=${createdOwls} owlsTotal=${owlCount}`,
  );

  await prisma.$disconnect();
  await redis.quit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
