import {
  BIOMES,
  PREY,
  HUNT_ITEM_DROPS,
  CRAFTING_RECIPES,
  DISMANTLE_TABLE,
  PRESTIGE_XP_BONUS_PER_LEVEL,
  PRESTIGE_STAT_CAP_BONUS_PER_LEVEL
} from './src/config';

// Basit simülasyon parametreleri
const DAYS = [7, 30, 180];
const HUNTS_PER_DAY = 50; // Ortalama aktif bir oyuncu

function simulate(days: number) {
  let totalCoins = 0;
  let totalXp = 0;
  let materials: Record<string, number> = {};
  let totalDismantles = 0;

  for (let d = 0; d < days; d++) {
    for (let h = 0; h < HUNTS_PER_DAY; h++) {
      // Rastgele bir biyom seç (genelde Deep Forest tercih edilir varsayalım)
      const biome = BIOMES[1]; // Deep Forest
      totalCoins -= biome.entryCost;

      // Av simülasyonu (ortalama 3 roll)
      const rolls = 3;
      for (let r = 0; r < rolls; r++) {
        // %70 yakalama şansı varsayalım
        if (Math.random() < 0.7) {
          const prey = PREY[Math.floor(Math.random() * PREY.length)];
          totalCoins += prey.sellPrice;
          totalXp += prey.xp;

          // Dismantle varsayalım (oyuncuların %50'si dismantle yapıyor)
          if (Math.random() < 0.5) {
            totalDismantles++;
            totalCoins -= prey.sellPrice; // Satıştan vazgeçti
            const mats = DISMANTLE_TABLE[prey.name] || [];
            mats.forEach(m => {
              const qty = Math.floor((m.min + m.max) / 2);
              materials[m.itemName] = (materials[m.itemName] || 0) + qty;
            });
          }

          // Item drop
          HUNT_ITEM_DROPS.forEach(drop => {
             if (Math.random() * 100 < drop.dropChance) {
               materials[drop.itemName] = (materials[drop.itemName] || 0) + 1;
             }
          });
        }
      }
    }
  }

  return { days, totalCoins, totalXp, materials, totalDismantles };
}

console.log("=== EKONOMİ SİMÜLASYONU RAPORU ===");
DAYS.forEach(d => {
  const res = simulate(d);
  console.log(`\n--- ${d} Günlük Senaryo ---`);
  console.log(`Net Coin Değişimi: ${res.totalCoins.toLocaleString()}`);
  console.log(`Toplam XP: ${res.totalXp.toLocaleString()}`);
  console.log(`Dismantle Sayısı: ${res.totalDismantles}`);
  console.log(`Materyal Stoğu:`, res.materials);
});
