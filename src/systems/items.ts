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
import {
  BUFF_ITEMS,
  BUFF_ITEM_MAP,
  BUFF_DIMINISHING_RATES,
  PVP_BUFF_DAMAGE_MULT_MAX,
  PVP_BUFF_DODGE_BONUS_MAX,
} from '../config';
import type { ActiveBuff, BuffEffects, BuffUseResult } from '../types';
import { clamp } from '../utils/math';
import { withLock } from '../utils/lock';

// Prisma'nın PlayerBuff modelini tip güvenli şekilde kullanmak için
// PrismaClient'ı any-cast ile erişiyoruz.
type AnyPrisma = PrismaClient & Record<string, any>;

// Prisma'dan gelen buff kaydı tipi
type BuffRow = {
  id:          string;
  playerId:    string;
  buffItemId:  string;
  category:    string;
  effectType:  string;
  effectValue: number;
  chargeMax:   number;
  chargeCur:   number;
  createdAt:   Date;
};

// ── BUFF AKTİFLEŞTİRME ───────────────────────────────────────────────────────

/**
 * Envanterdeki bir buff item'ını aktifleştirir.
 * Item envanterden düşülür, PlayerBuff tablosuna chargeMax ile eklenir.
 *
 * Kural: Aynı effectType'tan zaten 3 aktif (chargeCur > 0) buff varsa reddedilir.
 */
export async function activateBuff(
  prisma: AnyPrisma,
  playerId: string,
  buffItemId: string,
): Promise<BuffUseResult> {
  return withLock(playerId, 'buff', async () => {
    const def = BUFF_ITEM_MAP[buffItemId];
    if (!def) throw new Error(`Bilinmeyen buff item: ${buffItemId}`);

    return prisma.$transaction(async (tx: any) => {
      // Envanterde var mı?
      const inv = await tx.inventoryItem.findUnique({
        where: { ownerId_itemName: { ownerId: playerId, itemName: def.name } },
      });
      if (!inv || inv.quantity < 1) {
        throw new Error(`Envanterinde **${def.emoji} ${def.name}** yok.`);
      }

      // Aynı effectType'tan kaç aktif (chargeCur > 0) buff var?
      const existingCount = await tx.playerBuff.count({
        where: { playerId, effectType: def.effectType, chargeCur: { gt: 0 } },
      });
      if (existingCount >= 3) {
        throw new Error(
          `Aynı türden en fazla 3 aktif buff olabilir. ` +
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
          chargeCur:   def.chargeMax,   // tam dolu başlar
        },
      });

      return {
        buffItemId: def.id,
        buffName:   `${def.emoji} ${def.name}`,
        chargeCur:  def.chargeMax,
        chargeMax:  def.chargeMax,
        depleted:   false,
      };
    });
  });
}

// ── BUFF ETKİLERİNİ HESAPLA ───────────────────────────────────────────────────

/**
 * Oyuncunun belirli bir kategorideki aktif buff etkilerini hesaplar.
 * Sadece chargeCur > 0 olan buff'lar dahil edilir.
 * Diminishing returns: aynı effectType'tan 1. buff %100, 2. %60, 3. %30.
 */
export async function getBuffEffects(
  prisma: AnyPrisma,
  playerId: string,
  category: 'hunt' | 'upgrade' | 'pvp',
): Promise<BuffEffects> {
  const effects: BuffEffects = {
    catchBonus:      0,
    lootMult:        1.0,
    rareDropBonus:   0,
    upgradeBonus:    0,
    downgradeShield: 1.0,
    pvpDamageMult:   1.0,
    pvpDodgeBonus:   0,
  };

  const buffs: BuffRow[] = await prisma.playerBuff.findMany({
    where: { playerId, category, chargeCur: { gt: 0 } },
    orderBy: { createdAt: 'asc' },
  });

  if (buffs.length === 0) return effects;

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
          effects.upgradeBonus += scaledValue;
          break;
        case 'downgrade_shield':
          effects.downgradeShield = effects.downgradeShield * scaledValue;
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

  return effects;
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
  // Aktif buff'ları al
  const buffs: BuffRow[] = await prisma.playerBuff.findMany({
    where: { playerId, chargeCur: { gt: 0 } },
  });

  if (buffs.length === 0) return;

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
    const emoji = def?.emoji ?? '✨';
    return `${emoji} [${b.chargeCur}/${b.chargeMax}]`;
  });

  return parts.join(' · ');
}

