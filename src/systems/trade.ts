/**
 * trade.ts — P2P trade (Redis session + hard escrow)
 *
 * Invariant: eşya/coin trade’e eklenince oyuncudan düşer; iptal/expire iade eder.
 * Ready kilidi + karşı teklif değişince ready sıfır; çift Son onay ile settle.
 */

import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import {
  TRADE_ALLOW_OWLS,
  TRADE_CONFIRM_TTL_MS,
  TRADE_GUARD_REDIS_PREFIX,
  TRADE_INVITE_REDIS_PREFIX,
  TRADE_INVITE_TTL_MS,
  TRADE_MAX_SLOTS,
  TRADE_SESSION_REDIS_PREFIX,
  TRADE_TTL_MS,
} from '../config/trade';
import { formatCoinLabel } from '../config/ui-emojis';
import {
  addInventoryItemInRedis,
  applyInventoryQuantityInRedis,
  deductCoinsInRedis,
  applyCoinDeltaInRedis,
  hydratePlayerState,
} from '../state/player-state';
import { runWithFinancialLocks } from './economy-transaction-manager';

export type TradePhase = 'open' | 'confirming' | 'settled' | 'cancelled';

export interface TradeItemSlot {
  itemName: string;
  itemType: string;
  rarity: string;
  quantity: number;
}

export interface TradeOwlSlot {
  owlId: string;
  species: string;
  nickname: string | null;
  tier: number;
  moonTier: number;
  quality: string;
}

export interface TradeSide {
  userId: string;
  displayName: string;
  items: TradeItemSlot[];
  owls: TradeOwlSlot[];
  coins: number;
  ready: boolean;
  confirmed: boolean;
}

export interface TradeSession {
  id: string;
  phase: TradePhase;
  a: TradeSide;
  b: TradeSide;
  channelId: string;
  messageId: string | null;
  guildId: string | null;
  createdAt: number;
  updatedAt: number;
  confirmStartedAt: number | null;
  flash: string | null;
  /** İptal eden tarafın görünen adı (phase=cancelled). */
  cancelledByName: string | null;
}

export interface TradeInvite {
  id: string;
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  channelId: string;
  guildId: string | null;
  createdAt: number;
}

export class TradeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TradeError';
  }
}

function sessionKey(id: string): string {
  return `${TRADE_SESSION_REDIS_PREFIX}${id}`;
}

function guardKey(userId: string): string {
  return `${TRADE_GUARD_REDIS_PREFIX}${userId}`;
}

function inviteKey(id: string): string {
  return `${TRADE_INVITE_REDIS_PREFIX}${id}`;
}

function newId(bytes = 6): string {
  return randomBytes(bytes).toString('hex');
}

function ttlSec(ms: number): number {
  return Math.max(1, Math.ceil(ms / 1000));
}

function emptySide(userId: string, displayName: string): TradeSide {
  return {
    userId,
    displayName,
    items: [],
    owls: [],
    coins: 0,
    ready: false,
    confirmed: false,
  };
}

function sideOf(session: TradeSession, userId: string): TradeSide {
  if (session.a.userId === userId) return session.a;
  if (session.b.userId === userId) return session.b;
  throw new TradeError('Bu trade’de değilsin.');
}

function otherSide(session: TradeSide, sessionFull: TradeSession): TradeSide {
  return sessionFull.a.userId === session.userId ? sessionFull.b : sessionFull.a;
}

function offerNonEmpty(side: TradeSide): boolean {
  return side.coins > 0
    || side.items.some((i) => i.quantity > 0)
    || (side.owls?.length ?? 0) > 0;
}

function slotCount(side: TradeSide): number {
  return side.items.length + (side.owls?.length ?? 0);
}

function normalizeSession(session: TradeSession): TradeSession {
  if (!session.a.owls) session.a.owls = [];
  if (!session.b.owls) session.b.owls = [];
  return session;
}

/** player-state `INV_PREFIX` ile aynı — `state:inv:{playerId}` */
function inventoryRedisKey(playerId: string): string {
  return `state:inv:${playerId}`;
}

async function readInvQty(
  redis: Redis,
  playerId: string,
  itemName: string,
): Promise<{ quantity: number; itemType: string; rarity: string } | null> {
  const raw = await redis.hget(inventoryRedisKey(playerId), itemName);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { quantity: number; itemType: string; rarity: string };
    if (parsed.quantity <= 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Redis’te oyuncu guard’ı var mı.
 * @invariant Tek aktif trade / davet kilidi per user.
 */
export async function getActiveTradeSessionId(redis: Redis, userId: string): Promise<string | null> {
  return redis.get(guardKey(userId));
}

export async function getTradeSession(redis: Redis, sessionId: string): Promise<TradeSession | null> {
  const raw = await redis.get(sessionKey(sessionId));
  if (!raw) return null;
  try {
    return normalizeSession(JSON.parse(raw) as TradeSession);
  } catch {
    return null;
  }
}

async function saveSession(redis: Redis, session: TradeSession): Promise<void> {
  session.updatedAt = Date.now();
  const ttl = ttlSec(TRADE_TTL_MS);
  await redis.set(sessionKey(session.id), JSON.stringify(session), 'EX', ttl);
  await redis.set(guardKey(session.a.userId), session.id, 'EX', ttl);
  await redis.set(guardKey(session.b.userId), session.id, 'EX', ttl);
}

async function clearGuards(redis: Redis, session: TradeSession): Promise<void> {
  await redis.del(guardKey(session.a.userId), guardKey(session.b.userId), sessionKey(session.id));
}

async function refundSide(
  redis: Redis,
  prisma: PrismaClient,
  side: TradeSide,
): Promise<void> {
  if (side.coins > 0) {
    await applyCoinDeltaInRedis(redis, side.userId, side.coins, prisma);
  }
  for (const item of side.items) {
    if (item.quantity <= 0) continue;
    await addInventoryItemInRedis(
      redis,
      side.userId,
      item.itemName,
      item.itemType,
      item.rarity,
      item.quantity,
      prisma,
    );
  }
  for (const owl of side.owls ?? []) {
    await prisma.owl.updateMany({
      where: { id: owl.owlId, ownerId: side.userId, passiveMode: 'trade' },
      data: { passiveMode: 'idle' },
    });
  }
}

function resetReadies(session: TradeSession, flash: string | null): void {
  session.a.ready = false;
  session.b.ready = false;
  session.a.confirmed = false;
  session.b.confirmed = false;
  if (session.phase === 'confirming') {
    session.phase = 'open';
    session.confirmStartedAt = null;
  }
  session.flash = flash;
}

function assertParticipant(session: TradeSession, userId: string): TradeSide {
  return sideOf(session, userId);
}

function assertCanMutate(session: TradeSession, side: TradeSide): void {
  if (session.phase !== 'open') {
    throw new TradeError('Onay aşamasında teklif değiştirilemez.');
  }
  if (side.ready) {
    throw new TradeError('Hazırken teklif değiştiremezsin. Önce hazırlığı bırak.');
  }
}

/**
 * Trade daveti oluşturur (henüz escrow yok).
 */
export async function createTradeInvite(
  redis: Redis,
  prisma: PrismaClient,
  params: {
    fromId: string;
    fromName: string;
    toId: string;
    toName: string;
    channelId: string;
    guildId: string | null;
  },
): Promise<TradeInvite> {
  if (params.fromId === params.toId) {
    throw new TradeError('Kendinle trade yapamazsın.');
  }

  const [fromPlayer, toPlayer] = await Promise.all([
    prisma.player.findUnique({ where: { id: params.fromId }, select: { id: true } }),
    prisma.player.findUnique({ where: { id: params.toId }, select: { id: true } }),
  ]);
  if (!fromPlayer) throw new TradeError('Önce kayıt olmalısın.');
  if (!toPlayer) throw new TradeError('Karşı oyuncu kayıtlı değil.');

  const existingFrom = await getActiveTradeSessionId(redis, params.fromId);
  if (existingFrom) throw new TradeError('Zaten aktif bir trade’in var.');
  const existingTo = await getActiveTradeSessionId(redis, params.toId);
  if (existingTo) throw new TradeError('Karşı oyuncunun aktif trade’i var.');

  const invite: TradeInvite = {
    id: newId(),
    fromId: params.fromId,
    fromName: params.fromName,
    toId: params.toId,
    toName: params.toName,
    channelId: params.channelId,
    guildId: params.guildId,
    createdAt: Date.now(),
  };

  const ttl = ttlSec(TRADE_INVITE_TTL_MS);
  const setFrom = await redis.set(guardKey(params.fromId), `invite:${invite.id}`, 'EX', ttl, 'NX');
  if (setFrom !== 'OK') throw new TradeError('Zaten aktif bir trade veya davetin var.');
  const setTo = await redis.set(guardKey(params.toId), `invite:${invite.id}`, 'EX', ttl, 'NX');
  if (setTo !== 'OK') {
    await redis.del(guardKey(params.fromId));
    throw new TradeError('Karşı oyuncu meşgul.');
  }
  await redis.set(inviteKey(invite.id), JSON.stringify(invite), 'EX', ttl);
  return invite;
}

export async function getTradeInvite(redis: Redis, inviteId: string): Promise<TradeInvite | null> {
  const raw = await redis.get(inviteKey(inviteId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TradeInvite;
  } catch {
    return null;
  }
}

export async function cancelTradeInvite(redis: Redis, inviteId: string): Promise<TradeInvite | null> {
  const invite = await getTradeInvite(redis, inviteId);
  if (!invite) return null;
  await redis.del(inviteKey(inviteId), guardKey(invite.fromId), guardKey(invite.toId));
  return invite;
}

/**
 * Daveti kabul → open session (messageId sonra set edilir).
 */
export async function acceptTradeInvite(
  redis: Redis,
  inviteId: string,
  acceptorId: string,
): Promise<TradeSession> {
  const invite = await getTradeInvite(redis, inviteId);
  if (!invite) throw new TradeError('Davet süresi dolmuş.');
  if (invite.toId !== acceptorId) throw new TradeError('Bu davet sana değil.');

  const session: TradeSession = {
    id: newId(8),
    phase: 'open',
    a: emptySide(invite.fromId, invite.fromName),
    b: emptySide(invite.toId, invite.toName),
    channelId: invite.channelId,
    messageId: null,
    guildId: invite.guildId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    confirmStartedAt: null,
    flash: null,
    cancelledByName: null,
  };

  await redis.del(inviteKey(inviteId));
  await saveSession(redis, session);
  return session;
}

export async function bindTradeMessage(
  redis: Redis,
  sessionId: string,
  messageId: string,
): Promise<TradeSession> {
  const session = await getTradeSession(redis, sessionId);
  if (!session) throw new TradeError('Trade bulunamadı.');
  session.messageId = messageId;
  await saveSession(redis, session);
  return session;
}

/**
 * Eşya ekler (hard escrow). Aynı item stacklenir.
 * Karşı taraf ready ise her iki ready sıfırlanır.
 */
export async function tradeAddItem(
  redis: Redis,
  prisma: PrismaClient,
  sessionId: string,
  userId: string,
  itemName: string,
  quantity: number,
): Promise<TradeSession> {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new TradeError('Miktar en az 1 olmalı.');
  }

  return runWithFinancialLocks([userId], async () => {
    const session = await getTradeSession(redis, sessionId);
    if (!session || session.phase === 'settled' || session.phase === 'cancelled') {
      throw new TradeError('Trade aktif değil.');
    }
    const side = assertParticipant(session, userId);
    assertCanMutate(session, side);

    await hydratePlayerState(redis, prisma, userId, { includeInventory: true });
    const inv = await readInvQty(redis, userId, itemName);
    if (!inv || inv.quantity < quantity) {
      throw new TradeError('Yetersiz eşya.');
    }

    const existing = side.items.find((i) => i.itemName === itemName);
    if (!existing && slotCount(side) >= TRADE_MAX_SLOTS) {
      throw new TradeError(`En fazla **${TRADE_MAX_SLOTS}** farklı slot koyabilirsin.`);
    }

    const newQty = inv.quantity - quantity;
    await applyInventoryQuantityInRedis(redis, userId, itemName, newQty, {
      itemType: inv.itemType,
      rarity: inv.rarity,
    });

    if (existing) {
      existing.quantity += quantity;
    } else {
      side.items.push({
        itemName,
        itemType: inv.itemType,
        rarity: inv.rarity,
        quantity,
      });
    }

    const other = otherSide(side, session);
    const flash = other.ready
      ? `Teklif değişti — ${other.displayName} hazırlığı sıfırlandı.`
      : null;
    resetReadies(session, flash);
    // mutate eden taraf zaten ready değildi; other reset yeterli — ikisini de sıfırladık (scam kuralı)
    await saveSession(redis, session);
    return session;
  });
}

/**
 * Trade’deki bir item slotunu tamamen kaldırır ve iade eder.
 */
export async function tradeRemoveItem(
  redis: Redis,
  prisma: PrismaClient,
  sessionId: string,
  userId: string,
  itemName: string,
): Promise<TradeSession> {
  return runWithFinancialLocks([userId], async () => {
    const session = await getTradeSession(redis, sessionId);
    if (!session || session.phase === 'settled' || session.phase === 'cancelled') {
      throw new TradeError('Trade aktif değil.');
    }
    const side = assertParticipant(session, userId);
    assertCanMutate(session, side);

    const idx = side.items.findIndex((i) => i.itemName === itemName);
    if (idx < 0) throw new TradeError('Bu eşya trade’de yok.');
    const removed = side.items[idx]!;
    side.items.splice(idx, 1);
    await addInventoryItemInRedis(
      redis,
      userId,
      removed.itemName,
      removed.itemType,
      removed.rarity,
      removed.quantity,
      prisma,
    );

    const other = otherSide(side, session);
    const flash = other.ready
      ? `Teklif değişti — ${other.displayName} hazırlığı sıfırlandı.`
      : null;
    resetReadies(session, flash);
    await saveSession(redis, session);
    return session;
  });
}

/**
 * Baykuş ekler (hard escrow — passiveMode=trade). Main / market’teki baykuş yok.
 */
export async function tradeAddOwl(
  redis: Redis,
  prisma: PrismaClient,
  sessionId: string,
  userId: string,
  owlId: string,
): Promise<TradeSession> {
  if (!TRADE_ALLOW_OWLS) throw new TradeError('Baykuş trade kapalı.');

  return runWithFinancialLocks([userId], async () => {
    const session = await getTradeSession(redis, sessionId);
    if (!session || session.phase === 'settled' || session.phase === 'cancelled') {
      throw new TradeError('Trade aktif değil.');
    }
    const side = assertParticipant(session, userId);
    assertCanMutate(session, side);

    if (side.owls.some((o) => o.owlId === owlId)) {
      throw new TradeError('Bu baykuş zaten trade’de.');
    }
    if (slotCount(side) >= TRADE_MAX_SLOTS) {
      throw new TradeError(`En fazla **${TRADE_MAX_SLOTS}** farklı slot koyabilirsin.`);
    }

    const owl = await prisma.owl.findFirst({
      where: { id: owlId, ownerId: userId },
      select: {
        id: true,
        species: true,
        nickname: true,
        tier: true,
        moonTier: true,
        quality: true,
        isMain: true,
        passiveMode: true,
      },
    });
    if (!owl) throw new TradeError('Baykuş bulunamadı.');
    if (owl.isMain) throw new TradeError('Main baykuş trade’e konamaz. Başka bir baykuş dene.');
    if (owl.passiveMode === 'market') throw new TradeError('Baykuş markette listeli.');
    if (owl.passiveMode === 'trade') throw new TradeError('Baykuş zaten bir trade’de.');
    if (owl.passiveMode !== 'idle') {
      throw new TradeError('Bu baykuş şu an trade’e uygun değil.');
    }

    const updated = await prisma.owl.updateMany({
      where: { id: owl.id, ownerId: userId, passiveMode: 'idle', isMain: false },
      data: { passiveMode: 'trade' },
    });
    if (updated.count !== 1) throw new TradeError('Baykuş kilitlenemedi — tekrar dene.');

    side.owls.push({
      owlId: owl.id,
      species: owl.species,
      nickname: owl.nickname,
      tier: owl.tier,
      moonTier: owl.moonTier,
      quality: owl.quality,
    });

    const other = otherSide(side, session);
    const flash = other.ready
      ? `Teklif değişti — ${other.displayName} hazırlığı sıfırlandı.`
      : null;
    resetReadies(session, flash);
    await saveSession(redis, session);
    return session;
  });
}

/**
 * Trade’deki baykuşu kaldırır ve iade eder.
 */
export async function tradeRemoveOwl(
  redis: Redis,
  prisma: PrismaClient,
  sessionId: string,
  userId: string,
  owlId: string,
): Promise<TradeSession> {
  return runWithFinancialLocks([userId], async () => {
    const session = await getTradeSession(redis, sessionId);
    if (!session || session.phase === 'settled' || session.phase === 'cancelled') {
      throw new TradeError('Trade aktif değil.');
    }
    const side = assertParticipant(session, userId);
    assertCanMutate(session, side);

    const idx = side.owls.findIndex((o) => o.owlId === owlId);
    if (idx < 0) throw new TradeError('Bu baykuş trade’de yok.');
    side.owls.splice(idx, 1);

    await prisma.owl.updateMany({
      where: { id: owlId, ownerId: userId, passiveMode: 'trade' },
      data: { passiveMode: 'idle' },
    });

    const other = otherSide(side, session);
    const flash = other.ready
      ? `Teklif değişti — ${other.displayName} hazırlığı sıfırlandı.`
      : null;
    resetReadies(session, flash);
    await saveSession(redis, session);
    return session;
  });
}

/**
 * Coin teklifini mutlak değer olarak ayarlar (üstüne ekleme değil).
 */
export async function tradeSetCoins(
  redis: Redis,
  prisma: PrismaClient,
  sessionId: string,
  userId: string,
  amount: number,
): Promise<TradeSession> {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new TradeError('Geçersiz miktar.');
  }

  return runWithFinancialLocks([userId], async () => {
    const session = await getTradeSession(redis, sessionId);
    if (!session || session.phase === 'settled' || session.phase === 'cancelled') {
      throw new TradeError('Trade aktif değil.');
    }
    const side = assertParticipant(session, userId);
    assertCanMutate(session, side);

    const bundle = await hydratePlayerState(redis, prisma, userId);
    const wallet = bundle?.player.coins ?? 0;
    const alreadyEscrowed = side.coins;
    const available = wallet + alreadyEscrowed;
    if (amount > available) {
      throw new TradeError(
        `Yetersiz bakiye (mevcut: ${formatCoinLabel(available)}).`,
      );
    }

    const delta = amount - alreadyEscrowed;
    if (delta > 0) {
      await deductCoinsInRedis(redis, userId, delta, prisma);
    } else if (delta < 0) {
      await applyCoinDeltaInRedis(redis, userId, -delta, prisma);
    }
    side.coins = amount;

    const other = otherSide(side, session);
    const flash = other.ready
      ? `Teklif değişti — ${other.displayName} hazırlığı sıfırlandı.`
      : null;
    resetReadies(session, flash);
    await saveSession(redis, session);
    return session;
  });
}

/**
 * Hazır kilidi. İki taraf ready → confirming.
 * Boş↔boş reddedilir.
 */
export async function tradeToggleReady(
  redis: Redis,
  sessionId: string,
  userId: string,
): Promise<TradeSession> {
  const session = await getTradeSession(redis, sessionId);
  if (!session || session.phase === 'settled' || session.phase === 'cancelled') {
    throw new TradeError('Trade aktif değil.');
  }
  if (session.phase === 'confirming') {
    throw new TradeError('Zaten onay aşamasındasınız.');
  }

  const side = assertParticipant(session, userId);
  if (side.ready) {
    side.ready = false;
    session.flash = null;
    await saveSession(redis, session);
    return session;
  }

  const other = otherSide(side, session);
  if (!offerNonEmpty(side) && !offerNonEmpty(other)) {
    throw new TradeError('En az bir taraf eşya veya coin koymalı.');
  }

  side.ready = true;
  session.flash = null;
  if (session.a.ready && session.b.ready) {
    session.phase = 'confirming';
    session.confirmStartedAt = Date.now();
    session.a.confirmed = false;
    session.b.confirmed = false;
  }
  await saveSession(redis, session);
  return session;
}

/**
 * Confirm aşamasında Son onay. İkisi de onaylayınca settle.
 */
export async function tradeFinalConfirm(
  redis: Redis,
  prisma: PrismaClient,
  sessionId: string,
  userId: string,
): Promise<{ session: TradeSession; settled: boolean }> {
  const preview = await getTradeSession(redis, sessionId);
  if (!preview) throw new TradeError('Trade aktif değil.');
  assertParticipant(preview, userId);

  return runWithFinancialLocks([preview.a.userId, preview.b.userId], async () => {
    const session = await getTradeSession(redis, sessionId);
    if (!session || session.phase === 'settled' || session.phase === 'cancelled') {
      throw new TradeError('Trade aktif değil.');
    }
    if (session.phase !== 'confirming') {
      throw new TradeError('Önce her iki taraf da hazır olmalı.');
    }
    if (
      session.confirmStartedAt
      && Date.now() - session.confirmStartedAt > TRADE_CONFIRM_TTL_MS
    ) {
      session.phase = 'open';
      session.confirmStartedAt = null;
      resetReadies(session, 'Onay süresi doldu — hazırlıklar sıfırlandı.');
      await saveSession(redis, session);
      throw new TradeError('Onay süresi doldu. Tekrar hazır olun.');
    }

    const side = assertParticipant(session, userId);
    side.confirmed = true;
    session.flash = null;

    if (session.a.confirmed && session.b.confirmed) {
      await settleSession(redis, prisma, session);
      return { session, settled: true };
    }

    await saveSession(redis, session);
    return { session, settled: false };
  });
}

async function settleSession(
  redis: Redis,
  prisma: PrismaClient,
  session: TradeSession,
): Promise<void> {
  // A → B
  if (session.a.coins > 0) {
    await applyCoinDeltaInRedis(redis, session.b.userId, session.a.coins, prisma);
  }
  for (const item of session.a.items) {
    await addInventoryItemInRedis(
      redis,
      session.b.userId,
      item.itemName,
      item.itemType,
      item.rarity,
      item.quantity,
      prisma,
    );
  }
  for (const owl of session.a.owls ?? []) {
    await prisma.owl.updateMany({
      where: { id: owl.owlId, ownerId: session.a.userId, passiveMode: 'trade' },
      data: { ownerId: session.b.userId, passiveMode: 'idle', isMain: false },
    });
  }
  // B → A
  if (session.b.coins > 0) {
    await applyCoinDeltaInRedis(redis, session.a.userId, session.b.coins, prisma);
  }
  for (const item of session.b.items) {
    await addInventoryItemInRedis(
      redis,
      session.a.userId,
      item.itemName,
      item.itemType,
      item.rarity,
      item.quantity,
      prisma,
    );
  }
  for (const owl of session.b.owls ?? []) {
    await prisma.owl.updateMany({
      where: { id: owl.owlId, ownerId: session.b.userId, passiveMode: 'trade' },
      data: { ownerId: session.a.userId, passiveMode: 'idle', isMain: false },
    });
  }

  session.phase = 'settled';
  session.flash = null;
  await clearGuards(redis, session);
  await redis.set(sessionKey(session.id), JSON.stringify(session), 'EX', ttlSec(60_000));
  const { appendTradeLog } = await import('./trade-log.js');
  await appendTradeLog(
    redis,
    session.a.userId,
    session.a.displayName,
    session.b.userId,
    session.b.displayName,
    session.a.coins,
    session.b.coins,
    session.a.items,
    session.b.items,
  ).catch(() => undefined);
}

/**
 * Trade iptal — escrow iade.
 */
export async function cancelTrade(
  redis: Redis,
  prisma: PrismaClient,
  sessionId: string,
  userId: string,
): Promise<TradeSession> {
  const preview = await getTradeSession(redis, sessionId);
  if (!preview) throw new TradeError('Trade aktif değil.');
  assertParticipant(preview, userId);

  return runWithFinancialLocks([preview.a.userId, preview.b.userId], async () => {
    const session = await getTradeSession(redis, sessionId);
    if (!session || session.phase === 'settled' || session.phase === 'cancelled') {
      throw new TradeError('Trade aktif değil.');
    }
    assertParticipant(session, userId);

    await refundSide(redis, prisma, session.a);
    await refundSide(redis, prisma, session.b);
    const side = assertParticipant(session, userId);
    session.phase = 'cancelled';
    session.cancelledByName = side.displayName;
    session.a.items = [];
    session.b.items = [];
    session.a.owls = [];
    session.b.owls = [];
    session.a.coins = 0;
    session.b.coins = 0;
    await clearGuards(redis, session);
    await redis.set(sessionKey(session.id), JSON.stringify(session), 'EX', ttlSec(30_000));
    return session;
  });
}

/**
 * Confirm iptal → open + ready sıfır (escrow kalır).
 */
export async function abortTradeConfirm(
  redis: Redis,
  sessionId: string,
  userId: string,
): Promise<TradeSession> {
  const session = await getTradeSession(redis, sessionId);
  if (!session) throw new TradeError('Trade aktif değil.');
  assertParticipant(session, userId);
  if (session.phase !== 'confirming') {
    throw new TradeError('Onay aşamasında değilsiniz.');
  }
  resetReadies(session, 'Onay iptal edildi.');
  await saveSession(redis, session);
  return session;
}
