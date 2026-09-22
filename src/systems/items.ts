// ============================================================
// items.ts — Buff Item & Charge Sistemi
//
// Sorumluluklar:
//   1. Buff item'ı aktifleştirme (envanter → PlayerBuff)
//   2. Aktivite başına charge tüketimi (hunt/pvp/upgrade)
//   3. Buff etkilerini diminishing returns ile hesaplama
//   4. Aktif buff listesi (UI için)
//
// Charge Sistemi:
//   - Her buff item'ının chargeMax değeri vardır (ör. 100)
//   - Hunt: huntCost kadar tüketir (genellikle 1)
//   - PvP: pvpCost kadar tüketir (genellikle 1)
//   - Upgrade: upgradeCost kadar tüketir (genellikle 1)
//   - chargeCur = 0 olunca buff pasifleşir — item SİLİNMEZ
//   - Oyuncu "hunt is empowered by 🎯 [64/100]" şeklinde görür
//
// ÖNEMLİ: Bu sistem upgrade materyallerinden TAMAMEN AYRIDIR.
// ============================================================

import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { redis as sharedRedis } from '../utils/redis';
import {
  BUFF_ITEMS,
  BUFF_ITEM_MAP,
  BUFF_DIMINISHING_RATES,
  PVP_BUFF_DAMAGE_MULT_MAX,
  PVP_BUFF_DODGE_BONUS_MAX,
  UPGRADE_BUFF_COIN_DISCOUNT,
  UPGRADE_COIN_DISCOUNT_CAP,
} from '../config';
import { displayBuffEmoji } from '../config/custom-emojis';
import type { HuntHotPathMetricsCollector } from '../utils/hunt-hotpath-metrics';
import type { ActiveBuff, BuffEffects, BuffUseResult } from '../types';
import { clamp } from '../utils/math';
import { chargeBadge } from '../utils/theme';
import { withLock } from '../utils/lock';
import { applyInventoryQuantityInRedis } from '../state/player-state';

// Prisma'nın PlayerBuff modelini tip güvenli şekilde kullanmak için
// PrismaClient'ı any-cast ile erişiyoruz.
type AnyPrisma = PrismaClient & Record<string, any>;

// Prisma'dan gelen buff kaydı tipi
interface BuffRow {
  id:          string;
  playerId:    string;
  buffItemId:  string;
  category:    string;
  effectType:  string;
  effectValue: number;
  chargeMax:   number;
  chargeCur:   number;
  createdAt:   Date;
}

// ── BUFF AKTİFLEŞTİRME ───────────────────────────────────────────────────────

/**
 * Buff'ın ne işe yaradığını oyuncuya gösterilecek kısa metin olarak döndürür.
 */
function buildEffectDescription(def: (typeof BUFF_ITEMS)[number]): string {
  switch (def.effectType) {
    case 'catch_bonus':
      return `🎯 Yakalama **+${Math.round(def.effectValue * 100)}%**`;
    case 'loot_mult':
      return `📦 Drop **+${Math.round((def.effectValue - 1) * 100)}%**`;
    case 'rare_drop_bonus':
      return `🔮 Nadir drop **+${Math.round(def.effectValue * 100)}%**`;
    case 'upgrade_bonus':
      return `⚡ Upgrade coin **-%${Math.round(UPGRADE_BUFF_COIN_DISCOUNT * 100)}**`;
    case 'downgrade_shield':
      return `🛡️ *(eski buff — garanti upgrade'de etkisiz)*`;
    case 'pvp_damage_mult':
      return `⚔️ PvP hasar **+${Math.round((def.effectValue - 1) * 100)}%**`;
    case 'pvp_dodge_bonus':
      return `🌀 Dodge **+${Math.round(def.effectValue * 100)}%**`;
    default:
      return def.description;
  }
}

/**
 * Envanterdeki bir buff item'ını aktifleştirir.
 * Item envanterden düşülür, PlayerBuff tablosuna chargeMax ile eklenir.
 *
 * Kural: En fazla 3 aktif (chargeCur > 0) buff takılabilir (effectType ayrımı yok).
 */
export async function activateBuff(
  prisma: AnyPrisma,
  playerId: string,
  buffItemId: string,
  redis?: Redis,
): Promise<BuffUseResult> {
  return withLock(playerId, 'buff', async () => {
    const def = BUFF_ITEM_MAP[buffItemId];
    if (!def) throw new Error(`Bilinmeyen buff item: ${buffItemId}`);

    const { buffResult, remainingQty } = await prisma.$transaction(async (tx: any) => {
      // Envanterde var mı?
      const inv = await tx.inventoryItem.findUnique({
        where: { ownerId_itemName: { ownerId: playerId, itemName: def.name } },
      });
      if (!inv || inv.quantity < 1) {
        throw new Error(`Envanterinde **${displayBuffEmoji(def)} ${def.name}** yok.`);
      }

      // Toplam kaç aktif (chargeCur > 0) buff var?
      const existingCount = await tx.playerBuff.count({
        where: { playerId, chargeCur: { gt: 0 } },
      });
      if (existingCount >= 3) {
        throw new Error(
          `En fazla **3 aktif buff** takılabilir. ` +
          `Mevcut buff'larından birinin charge'ı bitmesini bekle.`,
        );
      }

      // Envanterden düş
      if (inv.quantity === 1) {
        await tx.inventoryItem.delete({
          where: { ownerId_itemName: { ownerId: playerId, itemName: def.name } },
        });
      } else {
        await tx.inventoryItem.update({
          where: { ownerId_itemName: { ownerId: playerId, itemName: def.name } },
          data: { quantity: { decrement: 1 } },
        });
      }

      // Aktif buff oluştur — chargeMax ile başlar
      await tx.playerBuff.create({
        data: {
          playerId,
          buffItemId:  def.id,
          category:    def.category,
          effectType:  def.effectType,
          effectValue: def.effectValue,
          chargeMax:   def.chargeMax,
          chargeCur:   def.chargeMax,
        },
      });

      await invalidateBuffEffectsCache(playerId, def.category as 'hunt' | 'upgrade' | 'pvp');

      return {
        buffResult: {
          buffItemId: def.id,
          buffName:   `${displayBuffEmoji(def)} ${def.name}`,
          chargeCur:  def.chargeMax,
          chargeMax:  def.chargeMax,
          depleted:   false,
          effectDescription: buildEffectDescription(def),
        },
        remainingQty: inv.quantity - 1,
      };
    });

    if (redis) {
      await applyInventoryQuantityInRedis(
        redis,
        playerId,
        def.name,
        remainingQty,
        { itemType: 'Buff', rarity: def.rarity },
      );
    }

    return buffResult;
  });
}

// ── BUFF ETKİLERİNİ HESAPLA ───────────────────────────────────────────────────

/**
 * Oyuncunun belirli bir kategorideki aktif buff etkilerini hesaplar.
 * In-memory cache: 30 saniye TTL — buff nadiren değişir, her hunt'ta DB sorgusu gereksiz.
 * Sadece chargeCur > 0 olan buff'lar dahil edilir.
 * Diminishing returns: aynı effectType'tan 1. buff %100, 2. %60, 3. %30.
 */

// In-memory buff cache: { key → { effects, expiresAt } }
const buffCache = new Map<string, { effects: BuffEffects; expiresAt: number }>();
const buffRowsCache = new Map<string, { rows: BuffRow[]; expiresAt: number }>();
const BUFF_CACHE_TTL_MS = 120_000;
const BUFF_CACHE_MAX = 10_000;
const BUFF_REDIS_PREFIX = 'state:buff:';
const BUFF_REDIS_TTL_SEC = 120;

function buffRedisKey(playerId: string, category: string): string {
  return `${BUFF_REDIS_PREFIX}${playerId}:${category}`;
}

async function readBuffRedisCache(playerId: string, category: string): Promise<BuffEffects | null> {
  try {
    const raw = await sharedRedis.get(buffRedisKey(playerId, category));
    if (!raw) return null;
    return JSON.parse(raw) as BuffEffects;
  } catch {
    return null;
  }
}

async function writeBuffRedisCache(
  playerId: string,
  category: string,
  effects: BuffEffects,
): Promise<void> {
  try {
    await sharedRedis.set(
      buffRedisKey(playerId, category),
      JSON.stringify(effects),
      'EX',
      BUFF_REDIS_TTL_SEC,
    );
  } catch {
    /* optional */
  }
}

function invalidateBuffEffectsCacheLocal(playerId: string, category: string): void {
  buffCache.delete(`${playerId}:${category}`);
  buffRowsCache.delete(`${playerId}:${category}`);
}

export async function invalidateBuffEffectsCache(
  playerId: string,
  category: 'hunt' | 'upgrade' | 'pvp',
): Promise<void> {
  invalidateBuffEffectsCacheLocal(playerId, category);
  try {
    await sharedRedis.del(buffRedisKey(playerId, category));
  } catch {
    /* optional */
  }
}

function enforceBuffCacheCap(): void {
  if (buffCache.size <= BUFF_CACHE_MAX) return;
  const oldestKey = buffCache.keys().next().value as string | undefined;
  if (!oldestKey) return;
  buffCache.delete(oldestKey);
}

export async function getBuffEffects(
  prisma: AnyPrisma,
  playerId: string,
  category: 'hunt' | 'upgrade' | 'pvp',
  metrics?: HuntHotPathMetricsCollector | null,
): Promise<BuffEffects> {
  // Cache kontrolü
  const cacheKey = `${playerId}:${category}`;
  const cached = buffCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    metrics?.addCacheHit();
    return cached.effects;
  }

  const redisCached = await readBuffRedisCache(playerId, category);
  if (redisCached) {
    metrics?.addCacheHit();
    buffCache.set(cacheKey, { effects: redisCached, expiresAt: Date.now() + BUFF_CACHE_TTL_MS });
    enforceBuffCacheCap();
    return redisCached;
  }

  metrics?.addCacheMiss();

  const effects: BuffEffects = {
    catchBonus:      0,
    lootMult:        1.0,
    rareDropBonus:   0,
    upgradeBonus:    0,
    upgradeCoinDiscount: 0,
    downgradeShield: 1.0,
    pvpDamageMult:   1.0,
    pvpDodgeBonus:   0,
  };

  const buffs: BuffRow[] = await prisma.playerBuff.findMany({
    where: { playerId, category, chargeCur: { gt: 0 } },
    orderBy: { createdAt: 'asc' },
  });
  metrics?.addPgRead();

  if (buffs.length === 0) {
    buffRowsCache.set(cacheKey, { rows: [], expiresAt: Date.now() + BUFF_CACHE_TTL_MS });
    void writeBuffRedisCache(playerId, category, effects);
    return effects;
  }

  buffRowsCache.set(cacheKey, { rows: buffs, expiresAt: Date.now() + BUFF_CACHE_TTL_MS });

  // effectType başına grupla (diminishing returns için)
  const byType = new Map<string, BuffRow[]>();
  for (const buff of buffs) {
    const list = byType.get(buff.effectType) ?? [];
    list.push(buff);
    byType.set(buff.effectType, list);
  }

  for (const [effectType, list] of byType) {
    list.forEach((buff: BuffRow, idx: number) => {
      const rate = BUFF_DIMINISHING_RATES[Math.min(idx, BUFF_DIMINISHING_RATES.length - 1)] ?? 0.3;
      const scaledValue = buff.effectValue * rate;

      switch (effectType) {
        case 'catch_bonus':
          effects.catchBonus += scaledValue;
          // orman_ruhu özel: hem catch hem loot bonus
          if (buff.buffItemId === 'b004') {
            effects.lootMult = effects.lootMult * (1 + 0.40 * rate); // +40% loot
          }
          break;
        case 'loot_mult':
          effects.lootMult = effects.lootMult * (1 + (scaledValue - 1));
          break;
        case 'rare_drop_bonus':
          effects.rareDropBonus += scaledValue;
          break;
        case 'upgrade_bonus':
          effects.upgradeCoinDiscount = Math.min(
            UPGRADE_COIN_DISCOUNT_CAP,
            effects.upgradeCoinDiscount + UPGRADE_BUFF_COIN_DISCOUNT * rate,
          );
          break;
        case 'downgrade_shield':
          break;
        case 'pvp_damage_mult':
          // arena_ustasi özel: hem damage hem dodge
          if (buff.buffItemId === 'b012') {
            effects.pvpDodgeBonus += 0.15 * rate; // +15% dodge (eskiden +6%)
          }
          effects.pvpDamageMult = effects.pvpDamageMult * (1 + (scaledValue - 1));
          break;
        case 'pvp_dodge_bonus':
          effects.pvpDodgeBonus += scaledValue;
          break;
      }
    });
  }

  // Cap'leri uygula
  effects.pvpDamageMult = Math.min(effects.pvpDamageMult, PVP_BUFF_DAMAGE_MULT_MAX);
  effects.pvpDodgeBonus = Math.min(effects.pvpDodgeBonus, PVP_BUFF_DODGE_BONUS_MAX);
  effects.lootMult      = clamp(1.0, 3.0, effects.lootMult);

  buffCache.set(cacheKey, { effects, expiresAt: Date.now() + BUFF_CACHE_TTL_MS });
  enforceBuffCacheCap();
  void writeBuffRedisCache(playerId, category, effects);

  return effects;
}

/** getBuffEffects sonrası hunt UI için charge satırları (ek PG sorgusu yok). */
export function getCachedHuntBuffDisplay(
  playerId: string,
): { emoji: string; chargeCur: number; chargeMax: number }[] | undefined {
  const cached = buffRowsCache.get(`${playerId}:hunt`);
  if (!cached || cached.expiresAt <= Date.now()) return undefined;
  return cached.rows
    .filter((b) => b.chargeCur > 0 && b.category === 'hunt')
    .map((b) => {
      const def = BUFF_ITEM_MAP[b.buffItemId];
      return {
        emoji: def ? displayBuffEmoji(def) : '✨',
        chargeCur: b.chargeCur,
        chargeMax: b.chargeMax,
      };
    });
}

// ── CHARGE TÜKETİMİ ──────────────────────────────────────────────────────────

/**
 * Belirli bir aktivite tipine göre aktif buff'ların charge'ını tüketir.
 * chargeCur 0'a düşen buff pasifleşir — silinmez, oyuncu görmeye devam eder.
 *
 * @param activityType 'hunt' | 'pvp' | 'upgrade'
 */
export async function drainBuffCharge(
  prisma: AnyPrisma,
  playerId: string,
  activityType: 'hunt' | 'pvp' | 'upgrade',
): Promise<void> {
  // Buff_Cache kontrolü — aktif buff yoksa DB'ye gitme (Gereksinim 3.1, 3.2, 3.5)
  const cacheKey = `${playerId}:${activityType}`;
  const cached = buffCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    const hasActiveBuff =
      cached.effects.catchBonus > 0 ||
      cached.effects.lootMult > 1.0 ||
      cached.effects.rareDropBonus > 0 ||
      cached.effects.upgradeCoinDiscount > 0 ||
      cached.effects.pvpDamageMult > 1.0 ||
      cached.effects.pvpDodgeBonus > 0;
    if (!hasActiveBuff) return; // Aktif buff yok, DB sorgusu gerekmez
  }

  // Aktif buff'ları al (Gereksinim 3.3)
  const buffs: BuffRow[] = await prisma.playerBuff.findMany({
    where: { playerId, chargeCur: { gt: 0 } },
  });

  if (buffs.length === 0) {
    // Cache miss durumunda boş sonucu cache'e yaz (Gereksinim 3.4)
    const emptyEffects: BuffEffects = {
      catchBonus:      0,
      lootMult:        1.0,
      rareDropBonus:   0,
      upgradeBonus:    0,
      upgradeCoinDiscount: 0,
      downgradeShield: 1.0,
      pvpDamageMult:   1.0,
      pvpDodgeBonus:   0,
    };
    buffCache.set(cacheKey, { effects: emptyEffects, expiresAt: Date.now() + BUFF_CACHE_TTL_MS });
    void writeBuffRedisCache(playerId, activityType, emptyEffects);
    return;
  }

  // Her buff için aktivite tipine göre maliyet hesapla
  const updates: Promise<unknown>[] = [];
  for (const buff of buffs) {
    const def = BUFF_ITEM_MAP[buff.buffItemId];
    if (!def) continue;

    const cost =
      activityType === 'hunt'    ? def.huntCost :
      activityType === 'pvp'     ? def.pvpCost :
      activityType === 'upgrade' ? def.upgradeCost : 0;

    if (cost <= 0) continue;  // Bu aktivite bu buff'ı tüketmez

    const newCharge = Math.max(0, buff.chargeCur - cost);
    updates.push(
      (prisma as any).playerBuff.update({
        where: { id: buff.id },
        data:  { chargeCur: newCharge },
      }),
    );
  }

  if (updates.length > 0) {
    await Promise.all(updates);
    await invalidateBuffEffectsCache(playerId, activityType);
  }
}

// ── AKTİF BUFF LİSTESİ ───────────────────────────────────────────────────────

/**
 * Oyuncunun tüm buff kayıtlarını döndürür (aktif + pasif).
 * UI'da "hunt is empowered by 🎯 [64/100]" gösterimi için kullanılır.
 */
export async function listActiveBuffs(
  prisma: AnyPrisma,
  playerId: string,
): Promise<ActiveBuff[]> {
  const rows: BuffRow[] = await prisma.playerBuff.findMany({
    where:   { playerId },
    orderBy: { createdAt: 'asc' },
  });

  return rows.map((r: BuffRow) => ({
    id:          r.id,
    playerId:    r.playerId,
    buffItemId:  r.buffItemId,
    category:    r.category,
    effectType:  r.effectType,
    effectValue: r.effectValue,
    chargeMax:   r.chargeMax,
    chargeCur:   r.chargeCur,
    createdAt:   r.createdAt,
  }));
}

/**
 * Envanterindeki buff item'larını listeler (sadece BUFF_ITEMS'dan olanlar).
 */
export async function listBuffInventory(
  prisma: AnyPrisma,
  playerId: string,
): Promise<{ def: (typeof BUFF_ITEMS)[number]; quantity: number }[]> {
  const buffNames = BUFF_ITEMS.map((b) => b.name);
  const rows = await prisma.inventoryItem.findMany({
    where: { ownerId: playerId, itemName: { in: buffNames } },
  });

  return rows
    .map((row: any) => {
      const def = BUFF_ITEMS.find((b) => b.name === row.itemName);
      if (!def) return null;
      return { def, quantity: row.quantity };
    })
    .filter((x: any): x is NonNullable<typeof x> => x !== null);
}

/**
 * Aktif buff'ların kısa özet stringini döndürür (hunt mesajı için).
 * Örnek: "🎯 [64/100] · 🌿 [80/80]"
 */
export async function getBuffSummary(
  prisma: AnyPrisma,
  playerId: string,
  category: 'hunt' | 'upgrade' | 'pvp',
): Promise<string | null> {
  const buffs: BuffRow[] = await prisma.playerBuff.findMany({
    where: { playerId, category, chargeCur: { gt: 0 } },
  });

  if (buffs.length === 0) return null;

  const parts = buffs.map((b: BuffRow) => {
    const def = BUFF_ITEM_MAP[b.buffItemId];
    const emoji = def ? displayBuffEmoji(def) : '✨';
    return `${emoji}${chargeBadge(b.chargeCur, b.chargeMax)}`;
  });

  return parts.join(' · ');
}

