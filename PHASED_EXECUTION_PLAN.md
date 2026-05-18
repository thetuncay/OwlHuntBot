# PHASED_EXECUTION_PLAN.md — OwlHuntBot Uygulama Planı

> Tarih: 2026-05-18 | Audit sonrası önceliklendirilmiş düzeltme planı.

---

## FAZ 0 — Acil Düzeltmeler (Bu hafta, deploy öncesi)

### 0.1 DB Queue Veri Kaybı Fix
**Dosya:** `src/utils/db-queue.ts`
**Değişiklik:** Queue başlatılmamışsa direkt Prisma yazma yap
```typescript
if (!queue) {
  // Fallback: direkt yaz
  processFallback(job, prismaRef).catch(err => console.error('[Queue] Fallback error:', err));
  return;
}
```

### 0.2 XP Multi-Level-Up Fix
**Dosya:** `src/systems/xp.ts`
**Değişiklik:** `if` → `while` döngüsü
```typescript
let currentLevel = player.level;
let currentXP = player.xp + gainedXP;
while (currentXP >= xpRequired(currentLevel)) {
  currentXP -= xpRequired(currentLevel);
  currentLevel++;
}
```

### 0.3 `$runCommandRaw` Kaldır
**Dosya:** `src/systems/hunt.ts`
**Değişiklik:** MongoDB-specific kodu kaldır, direkt `prisma.owl.update` kullan
```typescript
// Kaldır:
prisma.$runCommandRaw({ ... }).catch(() => prisma.owl.update(...))
// Yerine:
prisma.owl.update({ where: { id: owlId }, data: { bond: Math.min(BOND_MAX, owl.bond + BOND_GAIN_PER_HUNT) } })
```

---

## FAZ 1 — Ekonomi Stabilizasyonu (1. hafta)

### 1.1 Biome Giriş Ücreti Aktifleştir
**Dosya:** `src/systems/hunt.ts`, `src/utils/biome-session.ts`
**Değişiklik:**
1. Hunt başında biome session kontrolü
2. Biome'a ilk girişte `entryCost` tahsil et
3. 30 dakika session TTL uygula
4. Session bitince oyuncu varsayılan biome'a döner

### 1.2 Maintenance Scheduler Ekle
**Dosya:** `src/index.ts`
**Değişiklik:**
```typescript
// Günlük maintenance — gece yarısı çalışır
async function runDailyMaintenance(): Promise<void> {
  const players = await prisma.player.findMany({ select: { id: true } });
  for (const player of players) {
    await dailyMaintenance(prisma, player.id).catch(() => null);
  }
}
setInterval(() => { void runDailyMaintenance(); }, 24 * 60 * 60 * 1000);
```

### 1.3 Transfer Limitlerini Düşür
**Dosya:** `src/config.ts`
```typescript
export const TRANSFER_MIN_LEVEL = 15;        // 5 → 15
export const TRANSFER_DAILY_LIMIT = 3_000;   // 10.000 → 3.000
export const TRANSFER_DAILY_RECEIVE_LIMIT = 5_000; // 15.000 → 5.000
```

---

## FAZ 2 — Trait Sistemi Aktivasyonu (2. hafta)

### 2.1 Trait Etki Uygulayıcı
**Yeni dosya:** `src/utils/trait-effects.ts`
```typescript
export function getTraitEffects(traits: OwlTrait[]): {
  huntRewardMult: number;
  huntCatchMult: number;
  pvpDamageMult: number;
  pvpDodgeMult: number;
  tameChanceMult: number;
  xpGainMult: number;
  encounterRateMult: number;
  cooldownMult: number;
} {
  // Her trait'in bonusType ve penaltyType'ını uygula
}
```

### 2.2 Hunt'a Trait Entegrasyonu
**Dosya:** `src/systems/hunt.ts`
- `catchChance` hesaplamasında `huntCatchMult` uygula
- Av ödüllerinde `huntRewardMult` uygula

### 2.3 PvP'ye Trait Entegrasyonu
**Dosya:** `src/systems/pvp.ts` veya `pvp-sim.ts`
- Hasar hesaplamasında `pvpDamageMult` uygula
- Dodge hesaplamasında `pvpDodgeMult` uygula

---

## FAZ 3 — Güvenlik Sertleştirme (3. hafta)

### 3.1 Transfer Cooldown Race Condition Fix
**Dosya:** `src/systems/transfer.ts`
- Cooldown'u `withLock` içinde, transaction'dan önce set et

### 3.2 Admin Komut Güvenliği
**Dosya:** `src/commands/admin.ts`, `src/commands/admin-testtame.ts`
- Guild ID ve admin role kontrolü ekle
- Production'da test komutlarını devre dışı bırak

### 3.3 Lootbox Toplu Açma Optimizasyonu
**Dosya:** `src/systems/lootbox.ts`
- `openAllLootboxes` için tek transaction veya batch işleme

---

## FAZ 4 — Gameplay Derinliği (1. ay)

### 4.1 Crafting İçerik Genişletme
- 3 tarif → 10+ tarif
- Tier bazlı tarifler (yüksek tier materyaller → güçlü item)

### 4.2 Prestige Maliyeti
- Prestige yaparken coin sink ekle (örn. 5.000 × prestige_level)
- Envanter kısmen sıfırlansın (tartışmalı — tasarım kararı)

### 4.3 Passive Training Anlamlı Hale Getir
- Saatte 5 XP → saatte 30 XP (tier bazlı)
- Veya training modunu kaldır (dead feature)

---

## FAZ 5 — Polish (2. ay)

### 5.1 Log Aggregation
- Sentry veya benzeri entegrasyon
- Kritik hatalar için alert

### 5.2 Hata Mesajları Tutarlılığı
- Tüm hata mesajları Türkçe

### 5.3 Property Test Genişletme
- Hunt sistemi için property testler
- Transfer sistemi için property testler
- Market sistemi için property testler

### 5.4 Temizlik
- Kullanılmayan importlar (`index.ts`)
- `tame-test.ts` production'dan çıkar
- MongoDB kalıntıları temizle

---

## ÖNCELİK SIRASI

```
FAZ 0 (Bu hafta)
  ├── DB Queue fallback
  ├── XP multi-level-up
  └── $runCommandRaw kaldır

FAZ 1 (1. hafta)
  ├── Biome giriş ücreti ← EN KRİTİK EKONOMİ FİX
  ├── Maintenance scheduler
  └── Transfer limitleri

FAZ 2 (2. hafta)
  └── Trait sistemi ← EN KRİTİK GAMEPLAY FİX

FAZ 3 (3. hafta)
  ├── Güvenlik sertleştirme
  └── Exploit kapatma

FAZ 4-5 (1-2. ay)
  └── Derinlik ve polish
```

---

## BAŞARI KRİTERLERİ

| Faz | Başarı Kriteri |
|---|---|
| Faz 0 | `pnpm build` temiz, veri kaybı yok |
| Faz 1 | Biome ücreti alınıyor, maintenance çalışıyor |
| Faz 2 | Trait'ler hunt/pvp sonuçlarını etkiliyor |
| Faz 3 | Admin komutları güvenli, transfer exploit kapalı |
| Faz 4 | 10+ crafting tarifi, prestige anlamlı |
| Faz 5 | Tüm testler geçiyor, log sistemi aktif |
