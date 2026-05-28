/**
 * fix-consumable-types.ts — Crafting item'larının itemType'ını Buff'tan Consumable'a çevirir
 * Çalıştırma: npx tsx src/scripts/fix-consumable-types.ts
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  try {
    const lines = readFileSync(resolve(process.cwd(), '.env'), 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { /* devam et */ }
}
loadEnv();

const prisma = new PrismaClient();

async function main() {
  // CRAFTING_RECIPES'deki tüm result item adlarını al
  const consumableNames = ['Karma Yem', 'Bileme Taşı', 'Yırtıcı İksiri'];

  const result = await prisma.inventoryItem.updateMany({
    where: {
      itemName: { in: consumableNames },
      itemType: 'Buff', // sadece yanlış tiptekileri güncelle
    },
    data: { itemType: 'Consumable' },
  });

  console.log(`✅ ${result.count} item 'Buff' → 'Consumable' olarak güncellendi.`);

  // Kontrol
  const items = await prisma.inventoryItem.findMany({
    where: { itemName: { in: consumableNames } },
    select: { itemName: true, itemType: true, quantity: true, ownerId: true },
  });
  console.log('Güncel durum:');
  for (const item of items) {
    console.log(`  ${item.itemName} (${item.itemType}) ×${item.quantity} — oyuncu: ${item.ownerId}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
