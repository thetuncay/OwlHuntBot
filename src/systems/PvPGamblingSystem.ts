/**
 * PvPGamblingSystem.ts — Sosyal PvP Kumar Sistemi İş Mantığı
 *
 * Sorumluluklar:
 *   - Oturum yönetimi (Redis geçici state, Prisma kalıcı kayıt)
 *   - House cut hesaplama (temel + progressive)
 *   - Coin Flip Duel sonuç motoru
 *   - Slot Race sonuç motoru
 *   - Blackjack Pro kart motoru
 *   - Kayıp iadesi (Baykuş Tesellisi)
 *   - Seri Katil streak takibi
 *   - Race condition koruması (withLock + prisma.$transaction)
 */

import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { withLock } from '../utils/lock';
import { addXP } from './xp';
import { recordCoinsEarned } from './leaderboard';
import { SLOT_TABLE } from '../config';
import { weightedRandom } from '../utils/rng';
import {
  PVP_GAMBLE_MIN_BET,
  PVP_GAMBLE_COOLDOWN_MS,
  PVP_GAMBLE_HOUSE_CUT_BASE,
  PVP_GAMBLE_PROGRESSIVE_THRESHOLD,
  PVP_GAMBLE_PROGRESSIVE_STEP,
  PVP_GAMBLE_PROGRESSIVE_MAX,
  PVP_GAMBLE_REBATE_LOSS_STREAK,
  PVP_GAMBLE_REBATE_RATE,
  PVP_GAMBLE_REDIS_SESSION_PREFIX,
  PVP_GAMBLE_REDIS_PAIR_COUNT_PREFIX,
  PVP_GAMBLE_REDIS_CF_STREAK_PREFIX,
  PVP_GAMBLE_REDIS_LOSS_STREAK_PREFIX,
  PVP_GAMBLE_REDIS_LOSS_TOTAL_PREFIX,
  PVP_GAMBLE_SESSION_TTL_MS,
  PVP_GAMBLE_PAIR_COUNT_TTL_MS,
  PVP_CF_WIN_CHANCE,
  PVP_CF_PAYOUT,
  PVP_CF_SERIAL_KILLER_STREAK,
  PVP_SLOT_COMBO_XP_BONUS,
  PVP_BJ_BLACKJACK_PAYOUT,
  PVP_BJ_WIN_PAYOUT,
  PVP_BJ_PUSH_PAYOUT,
  PVP_GAMBLE_INVITE_TTL_MS,
} from '../config';
import { getCooldownRemainingMs, setCooldown } from '../middleware/cooldown';

// ─── Tip Tanımlamaları ────────────────────────────────────────────────────────

export type PvpGameMode = 'coinflip' | 'slot' | 'blackjack';
export type PvpSessionStatus = 'pending' | 'active' | 'finished' | 'cancelled';
export type BlackjackAction = 'hit' | 'stand';

/** Blackjack kart temsili */
export interface BJCard {
  suit: '♠' | '♥' | '♦' | '♣';
  rank: string; // '2'–'10', 'J', 'Q', 'K', 'A'
  value: number; // Hesaplanmış değer (A=11 veya 1)
}

/** Blackjack oyuncu eli */
export interface BJHand {
  cards: BJCard[];
  total: number;
  isBust: boolean;
  isBlackjack: boolean;
  isSoft: boolean; // Ace 11 olarak sayılıyorsa true
}

/** Redis'te saklanan PvP oturum verisi */
export interface PvpGamblingSession {
  sessionId: string;
  mode: PvpGameMode;
  challengerId: string;
  defenderId: string;
  bet: number;
  status: PvpSessionStatus;
  createdAt: number; // Unix ms
  // Blackjack'e özgü alanlar
  bj?: {
    challengerHand: BJCard[];
    defenderHand: BJCard[];
    deck: BJCard[];
    currentTurn: 'challenger' | 'defender'; // Sıra kimin
    challengerStood: boolean;
    defenderStood: boolean;
  };
}

/** Oyun sonucu — tüm modlar için ortak */
export interface PvpGamblingResult {
  sessionId: string;
  mode: PvpGameMode;
  winnerId: string | null; // null = beraberlik (sadece BJ)
  loserId: string | null;
  bet: number;
  houseCut: number;       // Kesilen miktar (coin)
  houseCutRate: number;   // Uygulanan oran (0.05 = %5)
  winnerGain: number;     // Kazananın net kazancı
  loserLoss: number;      // Kaybedenin kaybı
  serialKiller: boolean;  // Coin Flip'te seri katil tetiklendi mi
  cfStreak: number;       // Güncel CF serisi (kazanan için)
  rebate: PvpRebateResult | null;
  // Mod'a özgü detaylar
  coinflip?: { winner: 'challenger' | 'defender' };
  slot?: {
    challengerSymbols: string[];
    defenderSymbols: string[];
    comboBonus: boolean; // Her ikisi de aynı sembolü yakaladı mı
    comboXP: number;
  };
  blackjack?: {
    challengerHand: BJHand;
    defenderHand: BJHand;
    outcome: 'challenger_wins' | 'defender_wins' | 'push';
  };
}

/** Kayıp iadesi sonucu */
export interface PvpRebateResult {
  playerId: string;
  amount: number;       // İade edilen coin
  lossStreak: number;   // Tetikleyen kayıp serisi
  totalLoss: number;    // İade hesaplanan toplam kayıp
}

/** Davet akışı için ön-doğrulama sonucu */
export interface PvpInviteValidation {
  valid: boolean;
  error?: string;
  cooldownMs?: number;
}

// ─── Yardımcı: Redis Anahtar Üreticileri ─────────────────────────────────────

/** Oturum verisi anahtarı */
const sessionKey = (sessionId: string) =>
  `${PVP_GAMBLE_REDIS_SESSION_PREFIX}${sessionId}`;

/** Aynı iki oyuncu arasındaki ardışık oyun sayacı (sıra bağımsız) */
const pairCountKey = (a: string, b: string) => {
  const [p1, p2] = [a, b].sort();
  return `${PVP_GAMBLE_REDIS_PAIR_COUNT_PREFIX}${p1}:${p2}`;
};

/** Coin Flip galibiyet serisi anahtarı */
const cfStreakKey = (playerId: string) =>
  `${PVP_GAMBLE_REDIS_CF_STREAK_PREFIX}${playerId}`;

/** PvP kayıp serisi anahtarı */
const lossStreakKey = (playerId: string) =>
  `${PVP_GAMBLE_REDIS_LOSS_STREAK_PREFIX}${playerId}`;

/** Rebate için toplam kayıp takip anahtarı */
const lossTotalKey = (playerId: string) =>
  `${PVP_GAMBLE_REDIS_LOSS_TOTAL_PREFIX}${playerId}`;

/** PvP gambling cooldown anahtarı */
const cooldownKey = (playerId: string) =>
  `cooldown:pvp_gamble:${playerId}`;

// ─── Yardımcı: House Cut Hesaplama ───────────────────────────────────────────

/**
 * Uygulanacak house cut oranını hesaplar.
 * Aynı iki oyuncu arasında PROGRESSIVE_THRESHOLD'u aşan her oyun için
 * PROGRESSIVE_STEP kadar artar, PROGRESSIVE_MAX ile sınırlanır.
 */
export async function calcHouseCutRate(
  redis: Redis,
  challengerId: string,
  defenderId: string,
): Promise<number> {
  const raw = await redis.get(pairCountKey(challengerId, defenderId));
  const count = raw ? parseInt(raw, 10) : 0;

  if (count <= PVP_GAMBLE_PROGRESSIVE_THRESHOLD) {
    return PVP_GAMBLE_HOUSE_CUT_BASE;
  }

  const extra = (count - PVP_GAMBLE_PROGRESSIVE_THRESHOLD) * PVP_GAMBLE_PROGRESSIVE_STEP;
  return Math.min(PVP_GAMBLE_HOUSE_CUT_BASE + extra, PVP_GAMBLE_PROGRESSIVE_MAX);
}

/**
 * Oyun sonrası pair count'u artırır.
 * TTL: PVP_GAMBLE_PAIR_COUNT_TTL_MS (24 saat)
 */
async function incrementPairCount(redis: Redis, a: string, b: string): Promise<void> {
  const key = pairCountKey(a, b);
  const ttlSec = Math.floor(PVP_GAMBLE_PAIR_COUNT_TTL_MS / 1000);
  const current = await redis.get(key);
  if (current === null) {
    await redis.set(key, '1', 'EX', ttlSec);
  } else {
    await redis.incr(key);
    // TTL'yi yenile (son oyundan itibaren 24 saat)
    await redis.expire(key, ttlSec);
  }
}

// ─── Yardımcı: Oturum Yönetimi (Redis) ───────────────────────────────────────

/** Oturumu Redis'e kaydeder */
export async function saveSession(
  redis: Redis,
  session: PvpGamblingSession,
): Promise<void> {
  const ttlSec = Math.floor(PVP_GAMBLE_SESSION_TTL_MS / 1000);
  await redis.set(sessionKey(session.sessionId), JSON.stringify(session), 'EX', ttlSec);
}

/** Oturumu Redis'ten okur */
export async function getSession(
  redis: Redis,
  sessionId: string,
): Promise<PvpGamblingSession | null> {
  const raw = await redis.get(sessionKey(sessionId));
  if (!raw) return null;
  return JSON.parse(raw) as PvpGamblingSession;
}

/** Oturumu Redis'ten siler */
export async function deleteSession(redis: Redis, sessionId: string): Promise<void> {
  await redis.del(sessionKey(sessionId));
}

/** Oturumu günceller (kısmi güncelleme) */
export async function updateSession(
  redis: Redis,
  sessionId: string,
  patch: Partial<PvpGamblingSession>,
): Promise<PvpGamblingSession | null> {
  const existing = await getSession(redis, sessionId);
  if (!existing) return null;
  const updated = { ...existing, ...patch };
  await saveSession(redis, updated);
  return updated;
}

// ─── Yardımcı: Davet Ön-Doğrulama ────────────────────────────────────────────

/**
 * Oyun başlatmadan önce tüm ön koşulları kontrol eder.
 * Cooldown, minimum bahis, bakiye, aktif kilit.
 */
export async function validateInvite(
  prisma: PrismaClient,
  redis: Redis,
  challengerId: string,
  defenderId: string,
  bet: number,
): Promise<PvpInviteValidation> {
  // 1. Minimum bahis
  if (bet < PVP_GAMBLE_MIN_BET) {
    return {
      valid: false,
      error: `Minimum bahis **${PVP_GAMBLE_MIN_BET.toLocaleString('tr-TR')} coin**'dir.`,
    };
  }

  // 2. Challenger cooldown
  const challengerCd = await getCooldownRemainingMs(
    redis,
    cooldownKey(challengerId),
    PVP_GAMBLE_COOLDOWN_MS,
  );
  // getCooldownRemainingMs hem kontrol eder hem set eder — sadece kontrol için
  // checkCooldownRemainingMs kullanıyoruz (set etmeden)
  const challengerCdCheck = await redis.pttl(cooldownKey(challengerId));
  if (challengerCdCheck > 0) {
    return {
      valid: false,
      cooldownMs: challengerCdCheck,
      error: `Cooldown aktif. **${Math.ceil(challengerCdCheck / 1000)}sn** sonra tekrar dene.`,
    };
  }

  // 3. Defender cooldown
  const defenderCdCheck = await redis.pttl(cooldownKey(defenderId));
  if (defenderCdCheck > 0) {
    return {
      valid: false,
      cooldownMs: defenderCdCheck,
      error: `Rakibinin cooldown'u devam ediyor. **${Math.ceil(defenderCdCheck / 1000)}sn** bekle.`,
    };
  }

  // 4. Bakiye kontrolü (her iki oyuncu)
  const [challenger, defender] = await Promise.all([
    prisma.player.findUnique({ where: { id: challengerId }, select: { coins: true } }),
    prisma.player.findUnique({ where: { id: defenderId }, select: { coins: true } }),
  ]);

  if (!challenger || challenger.coins < bet) {
    return { valid: false, error: 'Yetersiz bakiye. Bahis miktarın kadar coin\'in olmalı.' };
  }
  if (!defender || defender.coins < bet) {
    return { valid: false, error: 'Rakibinin bu bahisi karşılayacak kadar coin\'i yok.' };
  }

  return { valid: true };
}

// ─── Yardımcı: Streak & Rebate Yönetimi ──────────────────────────────────────

/**
 * Coin Flip galibiyet serisini günceller.
 * Kazanan için artırır, kaybeden için sıfırlar.
 * Seri Katil eşiğine ulaşıldıysa true döner.
 */
async function updateCfStreak(
  redis: Redis,
  winnerId: string,
  loserId: string,
): Promise<{ streak: number; serialKiller: boolean }> {
  // Kaybeden sıfırla
  await redis.set(cfStreakKey(loserId), '0');

  // Kazanan artır
  const newStreak = await redis.incr(cfStreakKey(winnerId));
  // TTL yok — streak kalıcı (sadece kayıpla sıfırlanır)

  return {
    streak: newStreak,
    serialKiller: newStreak >= PVP_CF_SERIAL_KILLER_STREAK,
  };
}

/**
 * PvP kayıp serisini ve toplam kaybı günceller.
 * Kaybeden için artırır, kazanan için sıfırlar.
 * Rebate eşiğine ulaşıldıysa rebate sonucunu döner.
 */
async function updateLossStreak(
  redis: Redis,
  winnerId: string,
  loserId: string,
  lossAmount: number,
): Promise<PvpRebateResult | null> {
  // Kazanan sıfırla
  await redis.set(lossStreakKey(winnerId), '0');
  await redis.set(lossTotalKey(winnerId), '0');

  // Kaybeden artır
  const newStreak = await redis.incr(lossStreakKey(loserId));
  const newTotal = await redis.incrby(lossTotalKey(loserId), lossAmount);

  if (newStreak >= PVP_GAMBLE_REBATE_LOSS_STREAK) {
    const rebateAmount = Math.floor(newTotal * PVP_GAMBLE_REBATE_RATE);
    // Streak ve total'ı sıfırla (rebate tetiklendi)
    await redis.set(lossStreakKey(loserId), '0');
    await redis.set(lossTotalKey(loserId), '0');
    return {
      playerId: loserId,
      amount: rebateAmount,
      lossStreak: newStreak,
      totalLoss: newTotal,
    };
  }

  return null;
}

/**
 * Rebate'i DB'ye uygular (coin ekler).
 */
async function applyRebate(
  prisma: PrismaClient,
  rebate: PvpRebateResult,
): Promise<void> {
  if (rebate.amount <= 0) return;
  await prisma.player.update({
    where: { id: rebate.playerId },
    data: { coins: { increment: rebate.amount } },
  });
}

/**
 * Her iki oyuncu için cooldown set eder.
 */
async function applyPostGameCooldown(
  redis: Redis,
  challengerId: string,
  defenderId: string,
): Promise<void> {
  const ttlSec = Math.floor(PVP_GAMBLE_COOLDOWN_MS / 1000);
  await Promise.all([
    redis.set(cooldownKey(challengerId), '1', 'EX', ttlSec),
    redis.set(cooldownKey(defenderId), '1', 'EX', ttlSec),
  ]);
}

// ─── Oyun Motoru: Coin Flip Duel ──────────────────────────────────────────────

/**
 * Coin Flip sonucunu hesaplar ve DB'ye yansıtır.
 * %50/%50 olasılık, house cut uygulanır.
 * Race condition koruması: her iki oyuncu için withLock zinciri.
 */
export async function settleCoinFlip(
  prisma: PrismaClient,
  redis: Redis,
  session: PvpGamblingSession,
): Promise<PvpGamblingResult> {
  const { challengerId, defenderId, bet, sessionId } = session;

  // House cut oranını hesapla (progressive dahil)
  const houseCutRate = await calcHouseCutRate(redis, challengerId, defenderId);
  const houseCut = Math.floor(bet * houseCutRate);
  const netPot = bet * 2 - houseCut; // Kazananın alacağı

  // %50/%50 sonuç
  const challengerWins = Math.random() < PVP_CF_WIN_CHANCE / 100;
  const winnerId = challengerWins ? challengerId : defenderId;
  const loserId = challengerWins ? defenderId : challengerId;
  const winnerGain = netPot - bet; // Net kazanç (bahis zaten cepte, rakibin bahsi - house cut)
  const loserLoss = bet;

  // Atomik coin güncellemesi — her iki oyuncu için iç içe lock
  await withLock(challengerId, 'pvp_gamble', async () => {
    await withLock(defenderId, 'pvp_gamble', async () => {
      await prisma.$transaction(async (tx) => {
        // Kazanan: rakibin bahsini alır, house cut düşülür
        await tx.player.update({
          where: { id: winnerId },
          data: {
            coins: { increment: bet - houseCut }, // kendi bahsi zaten cepte, rakibin bahsi - cut
            totalPvpWins: { increment: 1 },
          },
        });
        // Kaybeden: bahsini kaybeder
        await tx.player.update({
          where: { id: loserId },
          data: { coins: { decrement: bet } },
        });
        // PvpSession kaydı
        await tx.pvpSession.create({
          data: {
            challengerId,
            defenderId,
            status: 'finished',
            winnerId,
            totalTurns: 1,
            finishedAt: new Date(),
          },
        });
      });
    });
  });

  // Streak güncellemeleri (Redis, lock dışında)
  const [cfResult, rebate] = await Promise.all([
    updateCfStreak(redis, winnerId, loserId),
    updateLossStreak(redis, winnerId, loserId, loserLoss),
  ]);

  // Rebate varsa uygula
  if (rebate) await applyRebate(prisma, rebate);

  // Pair count artır + cooldown set et
  await Promise.all([
    incrementPairCount(redis, challengerId, defenderId),
    applyPostGameCooldown(redis, challengerId, defenderId),
    recordCoinsEarned(prisma, winnerId, winnerGain).catch(() => null),
  ]);

  // Oturumu temizle
  await deleteSession(redis, sessionId);

  return {
    sessionId,
    mode: 'coinflip',
    winnerId,
    loserId,
    bet,
    houseCut,
    houseCutRate,
    winnerGain,
    loserLoss,
    serialKiller: cfResult.serialKiller,
    cfStreak: cfResult.streak,
    rebate,
    coinflip: { winner: challengerWins ? 'challenger' : 'defender' },
  };
}

// ─── Oyun Motoru: Slot Race ───────────────────────────────────────────────────

/**
 * Slot Race sonucunu hesaplar.
 * Her iki oyuncu için bağımsız slot spin, kazanan belirlenir.
 * Combo bonusu: her ikisi de aynı sembolü yakalarsa XP bonusu.
 */
export async function settleSlotRace(
  prisma: PrismaClient,
  redis: Redis,
  session: PvpGamblingSession,
): Promise<PvpGamblingResult> {
  const { challengerId, defenderId, bet, sessionId } = session;

  // House cut
  const houseCutRate = await calcHouseCutRate(redis, challengerId, defenderId);
  const houseCut = Math.floor(bet * houseCutRate);
  const netPot = bet * 2 - houseCut;

  // SLOT_TABLE'ı weightedRandom formatına dönüştür
  const slotOptions = SLOT_TABLE.map((entry) => ({ value: entry.name, weight: entry.chance }));

  // Her iki oyuncu için slot spin
  const challengerSymbols = [
    weightedRandom(slotOptions),
    weightedRandom(slotOptions),
    weightedRandom(slotOptions),
  ];
  const defenderSymbols = [
    weightedRandom(slotOptions),
    weightedRandom(slotOptions),
    weightedRandom(slotOptions),
  ];

  // Kazanan belirleme: 3 eşleşme > 2 eşleşme > yüksek sembol değeri
  const challengerScore = calcSlotScore(challengerSymbols);
  const defenderScore = calcSlotScore(defenderSymbols);

  const challengerWins = challengerScore > defenderScore;
  const winnerId = challengerWins ? challengerId : defenderId;
  const loserId = challengerWins ? defenderId : challengerId;
  const winnerGain = netPot - bet;
  const loserLoss = bet;

  // Combo bonusu kontrolü (her ikisi de aynı sembolü yakaladı mı)
  const comboBonus =
    challengerSymbols[0] === challengerSymbols[1] &&
    challengerSymbols[1] === challengerSymbols[2] &&
    defenderSymbols[0] === defenderSymbols[1] &&
    defenderSymbols[1] === defenderSymbols[2] &&
    challengerSymbols[0] === defenderSymbols[0];

  // Atomik coin güncellemesi
  await withLock(challengerId, 'pvp_gamble', async () => {
    await withLock(defenderId, 'pvp_gamble', async () => {
      await prisma.$transaction(async (tx) => {
        await tx.player.update({
          where: { id: winnerId },
          data: {
            coins: { increment: bet - houseCut },
            totalPvpWins: { increment: 1 },
          },
        });
        await tx.player.update({
          where: { id: loserId },
          data: { coins: { decrement: bet } },
        });
        await tx.pvpSession.create({
          data: {
            challengerId,
            defenderId,
            status: 'finished',
            winnerId,
            totalTurns: 1,
            finishedAt: new Date(),
          },
        });
      });
    });
  });

  // Combo bonusu varsa her iki oyuncuya XP ver
  if (comboBonus) {
    await Promise.all([
      addXP(prisma, challengerId, PVP_SLOT_COMBO_XP_BONUS, 'pvp_slot_combo'),
      addXP(prisma, defenderId, PVP_SLOT_COMBO_XP_BONUS, 'pvp_slot_combo'),
    ]);
  }

  // Streak & rebate
  const rebate = await updateLossStreak(redis, winnerId, loserId, loserLoss);
  if (rebate) await applyRebate(prisma, rebate);

  // Pair count + cooldown
  await Promise.all([
    incrementPairCount(redis, challengerId, defenderId),
    applyPostGameCooldown(redis, challengerId, defenderId),
    recordCoinsEarned(prisma, winnerId, winnerGain).catch(() => null),
  ]);

  await deleteSession(redis, sessionId);

  return {
    sessionId,
    mode: 'slot',
    winnerId,
    loserId,
    bet,
    houseCut,
    houseCutRate,
    winnerGain,
    loserLoss,
    serialKiller: false, // Slot'ta seri katil yok
    cfStreak: 0,
    rebate,
    slot: {
      challengerSymbols,
      defenderSymbols,
      comboBonus,
      comboXP: comboBonus ? PVP_SLOT_COMBO_XP_BONUS : 0,
    },
  };
}

/**
 * Slot sembollerinin skorunu hesaplar.
 * 3 eşleşme > 2 eşleşme > sembol değeri toplamı.
 */
function calcSlotScore(symbols: string[]): number {
  const [a, b, c] = symbols;
  if (a === b && b === c) return 1000 + getSymbolValue(a); // 3 eşleşme
  if (a === b || b === c || a === c) return 100 + getSymbolValue(a); // 2 eşleşme
  return getSymbolValue(a) + getSymbolValue(b) + getSymbolValue(c); // Toplam değer
}

/**
 * Slot sembolünün değerini döner (SLOT_TABLE'dan).
 */
function getSymbolValue(symbol: string): number {
  const entry = SLOT_TABLE.find((s) => s.name === symbol);
  return entry ? entry.payout : 0;
}

// ─── Oyun Motoru: Blackjack Pro — Kart Motoru ─────────────────────────────────

const SUITS: BJCard['suit'][] = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

/** Standart 52 kartlık deste oluşturur */
export function buildDeck(): BJCard[] {
  const deck: BJCard[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      const value = rank === 'A' ? 11 : ['J', 'Q', 'K'].includes(rank) ? 10 : parseInt(rank, 10);
      deck.push({ suit, rank, value });
    }
  }
  // Fisher-Yates karıştırma
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck;
}

/** El değerini hesaplar (Ace soft/hard yönetimi dahil) */
export function calcHandValue(cards: BJCard[]): BJHand {
  let total = 0;
  let aces = 0;
  let isSoft = false;

  for (const card of cards) {
    total += card.value;
    if (card.rank === 'A') aces++;
  }

  // Bust durumunda Ace'leri 1'e düşür
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }

  isSoft = aces > 0 && total <= 21;

  return {
    cards,
    total,
    isBust: total > 21,
    isBlackjack: cards.length === 2 && total === 21,
    isSoft,
  };
}

/**
 * Blackjack başlangıç dağıtımı yapar.
 * Her oyuncuya 2 kart verir, kalan deste oturumda saklanır.
 */
export function dealInitialHands(deck: BJCard[]): {
  challengerCards: BJCard[];
  defenderCards: BJCard[];
  remainingDeck: BJCard[];
} {
  const d = [...deck];
  const challengerCards = [d.pop()!, d.pop()!];
  const defenderCards = [d.pop()!, d.pop()!];
  return { challengerCards, defenderCards, remainingDeck: d };
}

/**
 * Hit işlemi: desteden bir kart çeker.
 */
export function hitCard(deck: BJCard[]): { card: BJCard; remainingDeck: BJCard[] } {
  const d = [...deck];
  const card = d.pop()!;
  return { card, remainingDeck: d };
}

/**
 * Blackjack Pro sonucunu hesaplar ve DB'ye yansıtır.
 * Her iki oyuncu da stand yaptıktan veya bust olduktan sonra çağrılır.
 */
export async function settleBlackjackPro(
  prisma: PrismaClient,
  redis: Redis,
  session: PvpGamblingSession,
): Promise<PvpGamblingResult> {
  const { challengerId, defenderId, bet, sessionId, bj } = session;
  if (!bj) throw new Error('Blackjack oturum verisi eksik.');

  const challengerHand = calcHandValue(bj.challengerHand);
  const defenderHand = calcHandValue(bj.defenderHand);

  // Kazanan belirleme
  let outcome: 'challenger_wins' | 'defender_wins' | 'push';
  if (challengerHand.isBust && defenderHand.isBust) {
    outcome = 'push';
  } else if (challengerHand.isBust) {
    outcome = 'defender_wins';
  } else if (defenderHand.isBust) {
    outcome = 'challenger_wins';
  } else if (challengerHand.isBlackjack && !defenderHand.isBlackjack) {
    outcome = 'challenger_wins';
  } else if (defenderHand.isBlackjack && !challengerHand.isBlackjack) {
    outcome = 'defender_wins';
  } else if (challengerHand.total > defenderHand.total) {
    outcome = 'challenger_wins';
  } else if (defenderHand.total > challengerHand.total) {
    outcome = 'defender_wins';
  } else {
    outcome = 'push';
  }

  const houseCutRate = await calcHouseCutRate(redis, challengerId, defenderId);
  const houseCut = outcome === 'push' ? 0 : Math.floor(bet * houseCutRate);

  // Payout çarpanı
  const isWinnerBJ =
    (outcome === 'challenger_wins' && challengerHand.isBlackjack) ||
    (outcome === 'defender_wins' && defenderHand.isBlackjack);
  const payoutMult = isWinnerBJ ? PVP_BJ_BLACKJACK_PAYOUT : PVP_BJ_WIN_PAYOUT;

  const winnerId = outcome === 'push' ? null : outcome === 'challenger_wins' ? challengerId : defenderId;
  const loserId = outcome === 'push' ? null : outcome === 'challenger_wins' ? defenderId : challengerId;
  const winnerGain = winnerId ? Math.floor(bet * (payoutMult - 1)) - houseCut : 0;
  const loserLoss = loserId ? bet : 0;

  // Atomik coin güncellemesi
  await withLock(challengerId, 'pvp_gamble', async () => {
    await withLock(defenderId, 'pvp_gamble', async () => {
      await prisma.$transaction(async (tx) => {
        if (outcome === 'push') {
          // Beraberlik: bahisler iade edilir (zaten cepte, işlem yok)
        } else {
          await tx.player.update({
            where: { id: winnerId! },
            data: {
              coins: { increment: Math.floor(bet * (payoutMult - 1)) - houseCut },
              totalPvpWins: { increment: 1 },
            },
          });
          await tx.player.update({
            where: { id: loserId! },
            data: { coins: { decrement: bet } },
          });
        }
        await tx.pvpSession.create({
          data: {
            challengerId,
            defenderId,
            status: 'finished',
            winnerId: winnerId ?? undefined,
            totalTurns: bj.challengerHand.length + bj.defenderHand.length,
            finishedAt: new Date(),
          },
        });
      });
    });
  });

  // Streak & rebate (sadece kazanan/kaybeden varsa)
  let rebate: PvpRebateResult | null = null;
  if (winnerId && loserId) {
    rebate = await updateLossStreak(redis, winnerId, loserId, loserLoss);
    if (rebate) await applyRebate(prisma, rebate);
    await recordCoinsEarned(prisma, winnerId, winnerGain).catch(() => null);
  }

  await Promise.all([
    incrementPairCount(redis, challengerId, defenderId),
    applyPostGameCooldown(redis, challengerId, defenderId),
  ]);

  await deleteSession(redis, sessionId);

  return {
    sessionId,
    mode: 'blackjack',
    winnerId,
    loserId,
    bet,
    houseCut,
    houseCutRate,
    winnerGain,
    loserLoss,
    serialKiller: false,
    cfStreak: 0,
    rebate,
    blackjack: { challengerHand, defenderHand, outcome },
  };
}
