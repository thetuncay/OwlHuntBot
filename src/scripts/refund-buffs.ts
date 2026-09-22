/**
 * refund-buffs.ts — Buff İade Migration Scripti
 *
 * Tüm oyuncuların aktif PlayerBuff kayıtlarını siler ve
 * karşılık gelen item'ları envantere iade eder.
 *
 * Çalıştırma:
 *   npx tsx src/scripts/refund-buffs.ts
 *
 * Güvenlik:
 *   - Önce DRY_RUN=true ile çalıştır, kaç kayıt etkileneceğini gör
 *   - Sonra DRY_RUN=false ile gerçek migration yap
 *   - Her oyuncu için transaction kullanılır — hata olursa o oyuncu atlanır
 */

import { PrismaClient } from '@prisma/client';
import { BUFF_ITEM_MAP } from '../config';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// .env dosyasını manuel parse et — dotenv bağımlılığı gerektirmez
function loadEnv() {
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
    // .env yoksa devam et — env zaten set edilmiş olabilir
  }
}
loadEnv();

const prisma = new PrismaClient();
const DRY_RUN = process.env['DRY_RUN'] !== 'false'; // varsayılan: dry run

async function main() {
  console.log('='.repeat(60));
  console.log('Buff İade Migration Scripti');
  console.log(`Mod: ${DRY_RUN ? '🔍 DRY RUN (değişiklik yok)' : '🚀 GERÇEK MIGRATION'}`);
  console.log('='.repeat(60));

  // Tüm aktif buff kayıtlarını çek (chargeCur > 0 olanlar iade edilir)
  // chargeCur = 0 olanlar zaten tükenmiş — iade etmeye gerek yok
  const allBuffs = await prisma.playerBuff.findMany({
    where: { chargeCur: { gt: 0 } },
    orderBy: [{ playerId: 'asc' }, { createdAt: 'asc' }],
  });

  if (allBuffs.length === 0) {
    console.log('✅ İade edilecek aktif buff bulunamadı.');
    return;
  }

  // Oyuncu bazında grupla
  const byPlayer = new Map<string, typeof allBuffs>();
  for (const buff of allBuffs) {
    const list = byPlayer.get(buff.playerId) ?? [];
    list.push(buff);
    byPlayer.set(buff.playerId, list);
  }

  console.log(`\n📊 Özet:`);
  console.log(`  Etkilenen oyuncu: ${byPlayer.size}`);
  console.log(`  Toplam buff kaydı: ${allBuffs.length}`);

  // Her oyuncu için iade edilecek item'ları hesapla
  let totalRefunded = 0;
  let totalDeleted = 0;
  let skippedUnknown = 0;

  for (const [playerId, buffs] of byPlayer) {
    // buffItemId → iade miktarı
    const refundMap = new Map<string, { itemName: string; itemType: string; rarity: string; quantity: number }>();

    for (const buff of buffs) {
      const def = BUFF_ITEM_MAP[buff.buffItemId];
      if (!def) {
        console.warn(`  ⚠️  Bilinmeyen buffItemId: ${buff.buffItemId} (oyuncu: ${playerId}) — atlandı`);
        skippedUnknown++;
        continue;
      }

      const existing = refundMap.get(def.id);
      if (existing) {
        existing.quantity++;
      } else {
        refundMap.set(def.id, {
          itemName: def.name,
          itemType: 'Buff',
          rarity:   def.rarity,
          quantity: 1,
        });
      }
    }

    if (refundMap.size === 0) continue;

    const refundLines = [...refundMap.values()]
      .map(r => `${r.quantity}x ${r.itemName}`)
      .join(', ');

    console.log(`  👤 ${playerId}: ${buffs.length} buff silindi → iade: ${refundLines}`);

    if (!DRY_RUN) {
      try {
        await prisma.$transaction(async (tx) => {
          // 1. Tüm aktif buff kayıtlarını sil
          await tx.playerBuff.deleteMany({
            where: {
              playerId,
              chargeCur: { gt: 0 },
            },
          });

          // 2. Her buff item'ını envantere ekle
          for (const item of refundMap.values()) {
            await (tx as any).inventoryItem.upsert({
              where: {
                ownerId_itemName: { ownerId: playerId, itemName: item.itemName },
              },
              create: {
                ownerId:  playerId,
                itemName: item.itemName,
                itemType: item.itemType,
                rarity:   item.rarity,
                quantity: item.quantity,
              },
              update: {
                quantity: { increment: item.quantity },
              },
            });
          }
        });

        totalDeleted  += buffs.length;
        totalRefunded += [...refundMap.values()].reduce((s, r) => s + r.quantity, 0);
      } catch (err) {
        console.error(`  ❌ ${playerId} için hata:`, err);
      }
    } else {
      totalDeleted  += buffs.length;
      totalRefunded += [...refundMap.values()].reduce((s, r) => s + r.quantity, 0);
    }
  }

  console.log('\n' + '='.repeat(60));
  if (DRY_RUN) {
    console.log('🔍 DRY RUN tamamlandı — hiçbir değişiklik yapılmadı.');
    console.log(`   Silinecek buff kaydı: ${totalDeleted}`);
    console.log(`   İade edilecek item:   ${totalRefunded}`);
    if (skippedUnknown > 0) console.log(`   Atlanacak (bilinmeyen): ${skippedUnknown}`);
    console.log('\nGerçek migration için:');
    console.log('  DRY_RUN=false npx tsx src/scripts/refund-buffs.ts');
  } else {
    console.log('✅ Migration tamamlandı.');
    console.log(`   Silinen buff kaydı: ${totalDeleted}`);
    console.log(`   İade edilen item:   ${totalRefunded}`);
    if (skippedUnknown > 0) console.log(`   Atlanan (bilinmeyen): ${skippedUnknown}`);
  }
  console.log('='.repeat(60));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
