// backup-and-reset.mjs
// Tüm oyuncu verilerini JSON olarak yedekler, ardından siler.

import { PrismaClient } from '@prisma/client';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupDir = join(process.cwd(), `backup_${timestamp}`);
mkdirSync(backupDir, { recursive: true });

function save(name, data) {
  const file = join(backupDir, `${name}.json`);
  writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`  ✓ ${name}: ${data.length} kayıt → ${file}`);
}

async function main() {
  console.log('\n📦 Yedek alınıyor...\n');

  const [
    players,
    owls,
    inventory,
    playerBuffs,
    encounters,
    pvpSessions,
    seasons,
    seasonArchives,
    registrations,
    marketListings,
    dailyQuests,
  ] = await Promise.all([
    prisma.player.findMany(),
    prisma.owl.findMany(),
    prisma.inventoryItem.findMany(),
    prisma.playerBuff.findMany(),
    prisma.encounter.findMany(),
    prisma.pvpSession.findMany(),
    prisma.season.findMany(),
    prisma.seasonArchive.findMany(),
    prisma.playerRegistration.findMany(),
    prisma.marketListing.findMany(),
    prisma.dailyQuest.findMany(),
  ]);

  save('players',        players);
  save('owls',           owls);
  save('inventory',      inventory);
  save('playerBuffs',    playerBuffs);
  save('encounters',     encounters);
  save('pvpSessions',    pvpSessions);
  save('seasons',        seasons);
  save('seasonArchives', seasonArchives);
  save('registrations',  registrations);
  save('marketListings', marketListings);
  save('dailyQuests',    dailyQuests);

  console.log(`\n✅ Yedek tamamlandı → ${backupDir}\n`);

  // ── VERİ SİLME ──────────────────────────────────────────────────────────
  console.log('🗑️  Veriler siliniyor...\n');

  // Foreign key bağımlılık sırasına göre sil
  await prisma.dailyQuest.deleteMany();       console.log('  ✓ DailyQuest silindi');
  await prisma.marketListing.deleteMany();    console.log('  ✓ MarketListing silindi');
  await prisma.playerBuff.deleteMany();       console.log('  ✓ PlayerBuff silindi');
  await prisma.encounter.deleteMany();        console.log('  ✓ Encounter silindi');
  await prisma.pvpSession.deleteMany();       console.log('  ✓ PvpSession silindi');
  await prisma.seasonArchive.deleteMany();    console.log('  ✓ SeasonArchive silindi');
  await prisma.season.deleteMany();           console.log('  ✓ Season silindi');
  await prisma.inventoryItem.deleteMany();    console.log('  ✓ InventoryItem silindi');
  await prisma.owl.deleteMany();              console.log('  ✓ Owl silindi');
  await prisma.playerRegistration.deleteMany(); console.log('  ✓ PlayerRegistration silindi');
  await prisma.player.deleteMany();           console.log('  ✓ Player silindi');

  console.log('\n✅ Tüm veriler silindi. Veritabanı temiz.\n');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
