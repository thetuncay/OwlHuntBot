/**
 * purge-legacy-items.ts — Kaldırılan eşyaları envanterden temizler
 *
 * Hedef:
 *   - InventoryItem (LEGACY_REMOVED_ITEM_NAMES)
 *   - PlayerBuff (b007–b012 — kaldırılan upgrade/PvP buff'ları)
 *   - Aktif market ilanları (legacy item — envantere iade ETMEZ)
 *
 * Çalıştırma:
 *   npx tsx src/scripts/purge-legacy-items.ts              # dry run (varsayılan)
 *   DRY_RUN=false npx tsx src/scripts/purge-legacy-items.ts
 *
 * Opsiyonel env:
 *   REFUND_LISTING_FEE=true  — iptal edilen pazar ilanının listingFeePaid iadesi
 *   SKIP_REDIS=true          — Redis reload atla (sadece PG temizliği)
 */

import { PrismaClient } from '@prisma/client';
import { COIN_EMOJI, XP_EMOJI } from '../config/ui-emojis';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { LEGACY_REMOVED_ITEM_NAMES } from '../config';
import { mirrorInventoryFromPg } from '../state/player-state';
import { redis, assertRedisConnection } from '../utils/redis';

/** Kaldırılan buff ID'leri (artık config'te yok) */
const REMOVED_BUFF_ITEM_IDS = ['b007', 'b008', 'b009', 'b010', 'b011', 'b012'] as const;

function loadEnv(): void {
  try {
    const envPath = resolve(process.cwd(), '.env');
    const lines = readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env yoksa devam et
  }
}

loadEnv();

const prisma = new PrismaClient();
const DRY_RUN = process.env['DRY_RUN'] !== 'false';
const REFUND_LISTING_FEE = process.env['REFUND_LISTING_FEE'] === 'true';
const SKIP_REDIS = process.env['SKIP_REDIS'] === 'true';

const LEGACY_NAMES = [...LEGACY_REMOVED_ITEM_NAMES];

interface ItemAgg {
  rows: number;
  quantity: number;
  players: Set<string>;
}

async function reportInventory(): Promise<Map<string, ItemAgg>> {
  const rows = await prisma.inventoryItem.findMany({
    where: { itemName: { in: LEGACY_NAMES } },
    select: { ownerId: true, itemName: true, quantity: true },
  });

  const byName = new Map<string, ItemAgg>();
  for (const row of rows) {
    let agg = byName.get(row.itemName);
    if (!agg) {
      agg = { rows: 0, quantity: 0, players: new Set() };
      byName.set(row.itemName, agg);
    }
    agg.rows++;
    agg.quantity += row.quantity;
    agg.players.add(row.ownerId);
  }
  return byName;
}

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Legacy Item Purge Migration');
  console.log(`Mod: ${DRY_RUN ? '🔍 DRY RUN' : '🚀 GERÇEK MIGRATION'}`);
  console.log(`Pazar ilan ücreti iadesi: ${REFUND_LISTING_FEE ? 'evet' : 'hayır'}`);
  console.log(`Redis reload: ${SKIP_REDIS ? 'atlanacak' : 'etkilenen oyuncular'}`);
  console.log('='.repeat(60));

  const [invByName, marketListings, activeBuffs] = await Promise.all([
    reportInventory(),
    prisma.marketListing.findMany({
      where: {
        status: 'active',
        itemName: { in: LEGACY_NAMES },
      },
      select: {
        id: true,
        listingNo: true,
        sellerId: true,
        itemName: true,
        quantity: true,
        listingFeePaid: true,
      },
    }),
    prisma.playerBuff.findMany({
      where: { buffItemId: { in: [...REMOVED_BUFF_ITEM_IDS] } },
      select: { id: true, playerId: true, buffItemId: true, chargeCur: true },
    }),
  ]);

  const affectedPlayers = new Set<string>();
  for (const agg of invByName.values()) {
    for (const id of agg.players) affectedPlayers.add(id);
  }
  for (const l of marketListings) affectedPlayers.add(l.sellerId);
  for (const b of activeBuffs) affectedPlayers.add(b.playerId);

  const totalInvRows = [...invByName.values()].reduce((s, a) => s + a.rows, 0);
  const totalInvQty = [...invByName.values()].reduce((s, a) => s + a.quantity, 0);

  console.log('\n📦 Envanter (legacy item):');
  if (invByName.size === 0) {
    console.log('  (kayıt yok)');
  } else {
    for (const name of LEGACY_NAMES) {
      const agg = invByName.get(name);
      if (!agg) continue;
      console.log(`  ${name}: ${agg.quantity} adet · ${agg.players.size} oyuncu · ${agg.rows} satır`);
    }
    console.log(`  TOPLAM: ${totalInvQty} adet · ${totalInvRows} satır`);
  }

  console.log('\n📜 Aktif pazar ilanları:');
  if (marketListings.length === 0) {
    console.log('  (yok)');
  } else {
    for (const l of marketListings) {
      console.log(`  #${l.listingNo} ${l.itemName} ×${l.quantity} — satıcı ${l.sellerId}`);
    }
  }

  console.log('\n✨ Aktif/tükenmiş legacy PlayerBuff:');
  if (activeBuffs.length === 0) {
    console.log('  (yok)');
  } else {
    const byBuff = new Map<string, number>();
    for (const b of activeBuffs) {
      byBuff.set(b.buffItemId, (byBuff.get(b.buffItemId) ?? 0) + 1);
    }
    for (const [id, count] of byBuff) {
      console.log(`  ${id}: ${count} kayıt`);
    }
  }

  console.log(`\n👥 Etkilenen benzersiz oyuncu: ${affectedPlayers.size}`);

  if (totalInvRows === 0 && marketListings.length === 0 && activeBuffs.length === 0) {
    console.log('\n✅ Temizlenecek legacy kayıt yok.');
    return;
  }

  if (DRY_RUN) {
    console.log('\n🔍 DRY RUN tamamlandı — değişiklik yapılmadı.');
    console.log('Gerçek migration:');
    console.log('  DRY_RUN=false npx tsx src/scripts/purge-legacy-items.ts');
    return;
  }

  if (!SKIP_REDIS) {
    await assertRedisConnection();
    console.log('\n[Redis] Bağlantı OK');
  }

  let listingsCancelled = 0;
  let feesRefunded = 0;
  let buffsDeleted = 0;
  let invRowsDeleted = 0;

  // 1) Pazar — envantere iade yok (eşya zaten kaldırılıyor)
  for (const listing of marketListings) {
    try {
      await prisma.$transaction(async (tx) => {
        const current = await tx.marketListing.findUnique({ where: { id: listing.id } });
        if (!current || current.status !== 'active') return;

        if (REFUND_LISTING_FEE && current.listingFeePaid > 0) {
          await tx.player.update({
            where: { id: current.sellerId },
            data: { coins: { increment: current.listingFeePaid } },
          });
        }

        await tx.marketListing.update({
          where: { id: current.id },
          data: { status: 'cancelled' },
        });
      });
      listingsCancelled++;
      if (REFUND_LISTING_FEE && listing.listingFeePaid > 0) {
        feesRefunded += listing.listingFeePaid;
      }
    } catch (err) {
      console.error(`  ❌ İlan #${listing.listingNo} iptal hatası:`, err);
    }
  }

  // 2) Legacy PlayerBuff
  const buffResult = await prisma.playerBuff.deleteMany({
    where: { buffItemId: { in: [...REMOVED_BUFF_ITEM_IDS] } },
  });
  buffsDeleted = buffResult.count;

  // 3) Envanter
  const invResult = await prisma.inventoryItem.deleteMany({
    where: { itemName: { in: LEGACY_NAMES } },
  });
  invRowsDeleted = invResult.count;

  // 4) Redis envanter cache
  if (!SKIP_REDIS && affectedPlayers.size > 0) {
    console.log(`\n[Redis] ${affectedPlayers.size} oyuncu envanteri yenileniyor...`);
    let reloaded = 0;
    for (const playerId of affectedPlayers) {
      try {
        await mirrorInventoryFromPg(redis, prisma, playerId);
        reloaded++;
      } catch (err) {
        console.error(`  ⚠️ Redis reload ${playerId}:`, err);
      }
    }
    console.log(`[Redis] ${reloaded}/${affectedPlayers.size} tamamlandı`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Migration tamamlandı');
  console.log(`  İptal edilen ilan:     ${listingsCancelled}`);
  if (REFUND_LISTING_FEE) console.log(`  İade edilen ilan ücreti: ${feesRefunded} ${COIN_EMOJI}`);
  console.log(`  Silinen PlayerBuff:    ${buffsDeleted}`);
  console.log(`  Silinen envanter satırı: ${invRowsDeleted}`);
  console.log('='.repeat(60));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (!SKIP_REDIS) {
      try {
        await redis.quit();
      } catch {
        // ignore
      }
    }
    await prisma.$disconnect();
  });
