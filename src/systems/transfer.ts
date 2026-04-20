// ============================================================
// transfer.ts — Oyuncular Arası Para Transferi
//
// Anti-abuse katmanları:
//   1. Minimum seviye (TRANSFER_MIN_LEVEL)
//   2. Minimum miktar (TRANSFER_MIN_AMOUNT)
//   3. Kendi kendine gönderme yasağı
//   4. Alıcı kayıtlı olmalı
//   5. Cooldown (Redis, TRANSFER_COOLDOWN_MS)
//   6. Günlük limit (TRANSFER_DAILY_LIMIT)
//   7. Kademeli vergi (TRANSFER_TAX_BRACKETS) — yakılır
//
// Vergi ekonomi sinkidir: ne gönderene ne alıcıya gider, yok olur.
// ============================================================

import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import {
  TRANSFER_COOLDOWN_MS,
  TRANSFER_DAILY_LIMIT,
  TRANSFER_MIN_AMOUNT,
  TRANSFER_MIN_LEVEL,
  TRANSFER_TAX_BRACKETS,
} from '../config';
import { withLock } from '../utils/lock';

// ── TİPLER ───────────────────────────────────────────────────────────────────

export interface TransferResult {
  sent:        number;   // gönderilen miktar
  tax:         number;   // kesilen vergi
  taxRate:     number;   // uygulanan vergi oranı (0.05 = %5)
  received:    number;   // alıcıya ulaşan miktar
  senderCoins: number;   // gönderici yeni bakiye
  dailySent:   number;   // bugün toplam gönderilen (bu transfer dahil)
  dailyLimit:  number;   // günlük limit
}

// ── YARDIMCI FONKSİYONLAR ────────────────────────────────────────────────────

/**
 * Miktara göre vergi oranını döndürür (kademeli dilim sistemi).
 */
export function calcTaxRate(amount: number): number {
  for (const bracket of TRANSFER_TAX_BRACKETS) {
    if (amount <= bracket.upTo) return bracket.rate;
  }
  // Fallback — son dilim Infinity olduğu için buraya gelinmez
  return TRANSFER_TAX_BRACKETS[TRANSFER_TAX_BRACKETS.length - 1]!.rate;
}

/**
 * Vergi miktarını hesaplar (yukarı yuvarlanır — oyuncu lehine değil).
 */
export function calcTax(amount: number): { tax: number; received: number; rate: number } {
  const rate     = calcTaxRate(amount);
  const tax      = Math.ceil(amount * rate);
  const received = amount - tax;
  return { tax, received, rate };
}

/** Cooldown Redis key */
function cooldownKey(senderId: string): string {
  return `cooldown:transfer:${senderId}`;
}

/** Cooldown kalan süre (ms), 0 = hazır */
export async function getTransferCooldown(redis: Redis, senderId: string): Promise<number> {
  const ttl = await redis.pttl(cooldownKey(senderId));
  return ttl > 0 ? ttl : 0;
}

/** Cooldown set et */
async function setTransferCooldown(redis: Redis, senderId: string): Promise<void> {
  await redis.set(cooldownKey(senderId), '1', 'PX', TRANSFER_COOLDOWN_MS);
}

// ── ANA FONKSİYON ────────────────────────────────────────────────────────────

/**
 * Bir oyuncudan diğerine coin transferi yapar.
 * Tüm kontroller burada — komut katmanı sadece sonucu gösterir.
 *
 * @throws Hata mesajı içeren Error — komut katmanı bunu yakalar ve gösterir
 */
export async function transferCoins(
  prisma: PrismaClient,
  redis:  Redis,
  senderId:   string,
  receiverId: string,
  amount:     number,
): Promise<TransferResult> {
  // ── Temel doğrulamalar (DB'ye gitmeden) ──────────────────────────────────
  if (senderId === receiverId) {
    throw new Error('Kendine coin gönderemezsin.');
  }
  if (!Number.isInteger(amount) || amount < TRANSFER_MIN_AMOUNT) {
    throw new Error(`Minimum transfer miktarı **${TRANSFER_MIN_AMOUNT}** 💰`);
  }

  // ── Cooldown kontrolü ────────────────────────────────────────────────────
  const cooldownMs = await getTransferCooldown(redis, senderId);
  if (cooldownMs > 0) {
    const secs = Math.ceil(cooldownMs / 1000);
    throw new Error(`Transfer cooldown: **${secs}s** beklemelisin.`);
  }

  // ── DB işlemleri (lock altında) ──────────────────────────────────────────
  return withLock(senderId, 'transfer', async () => {
    return prisma.$transaction(async (tx) => {
      // Gönderici kontrolü
      const sender = await tx.player.findUnique({ where: { id: senderId } });
      if (!sender) throw new Error('Oyuncu bulunamadı.');

      if (sender.level < TRANSFER_MIN_LEVEL) {
        throw new Error(
          `Transfer için minimum **Seviye ${TRANSFER_MIN_LEVEL}** gerekli. ` +
          `Şu an: Seviye ${sender.level}`,
        );
      }
      if (sender.coins < amount) {
        throw new Error(
          `Yetersiz coin. Sahip: **${sender.coins}** 💰, Gerekli: **${amount}** 💰`,
        );
      }

      // Günlük limit kontrolü
      const today = new Date();
      const isNewDay =
        !sender.lastTransferDate ||
        (sender.lastTransferDate as Date).toDateString() !== today.toDateString();

      const currentDailySent = isNewDay ? 0 : (sender.dailyTransferSent ?? 0);
      if (currentDailySent + amount > TRANSFER_DAILY_LIMIT) {
        const remaining = TRANSFER_DAILY_LIMIT - currentDailySent;
        throw new Error(
          `Günlük transfer limitine ulaştın. ` +
          `Kalan: **${remaining > 0 ? remaining : 0}** 💰 / ${TRANSFER_DAILY_LIMIT} 💰`,
        );
      }

      // Alıcı kontrolü
      const receiver = await tx.player.findUnique({ where: { id: receiverId } });
      if (!receiver) {
        throw new Error('Alıcı oyuncu bulunamadı. Önce kayıt olması gerekiyor.');
      }

      // Vergi hesapla
      const { tax, received, rate } = calcTax(amount);

      // Gönderici: coin düş + günlük sayaç güncelle
      await tx.player.update({
        where: { id: senderId },
        data: {
          coins:              { decrement: amount },
          dailyTransferSent:  isNewDay ? amount : { increment: amount },
          lastTransferDate:   today,
        },
      });

      // Alıcı: vergi düşülmüş miktarı ekle
      await tx.player.update({
        where: { id: receiverId },
        data: { coins: { increment: received } },
      });

      // Vergi yakılır — hiçbir yere eklenmez (ekonomi sink)

      // Cooldown set et (transaction dışında — başarı garantili olduktan sonra)
      // Not: transaction commit sonrası çalışır
      const newSenderCoins = sender.coins - amount;
      const newDailySent   = currentDailySent + amount;

      return {
        sent:        amount,
        tax,
        taxRate:     rate,
        received,
        senderCoins: newSenderCoins,
        dailySent:   newDailySent,
        dailyLimit:  TRANSFER_DAILY_LIMIT,
      } satisfies TransferResult;
    });
  }).then(async (result) => {
    // Transaction başarılı → cooldown set et
    await setTransferCooldown(redis, senderId);
    return result;
  });
}
