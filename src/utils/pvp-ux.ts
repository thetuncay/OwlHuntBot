/**
 * pvp-ux.ts — PvP animasyon ve çıktı katmanı
 * Backend logic'e dokunmaz. Sadece UX.
 */

import { AttachmentBuilder } from 'discord.js';
import { hpBarColored } from './theme';
import {
  OWL_SPECIES,
  PVP_BATTLE_ANIM_MAX_FRAMES,
  PVP_BATTLE_ANIM_MIN_FRAMES,
  SIM_PVP_ANIM_FRAME_MS,
  SIM_PVP_ANIM_INTRO_MS,
  SIM_PVP_ANIM_OUTRO_MS,
  SIM_PVP_SKIP_ANIM,
} from '../config';
import { resolveOwlMoonTierFromStats } from '../systems/owl-moon-evolution';
import { renderOwlMoonEmoji } from '../config/custom-emojis';
import { buildDuelResultMessage } from './duel-ux';
import type { PrismaClient } from '@prisma/client';
import { combatFromParts, renderBattleCardPng, type BattleCardFighter } from './battle-card';

// ─── Tipler ───────────────────────────────────────────────────────────────────
export type PvpDuelOwlProfile = {
  name: string;
  hpMax: number;
  staminaCur: number;
  tier: number;
  statGaga: number;
  statPence: number;
  statGoz: number;
  statKulak: number;
  statKanat: number;
};

const PVP_DUEL_OWL_SELECT = {
  tier: true,
  hpMax: true,
  staminaCur: true,
  statGaga: true,
  statPence: true,
  statGoz: true,
  statKulak: true,
  statKanat: true,
} as const;
export interface PvpTurnEvent {
  turn: number;
  attackerId: string;
  defenderId: string;
  damage: number;
  attackerHp: number;
  defenderHp: number;
  attackerHpMax: number;
  defenderHpMax: number;
  isCrit: boolean;
  isExecute: boolean;
  isLastHit: boolean;
}

export interface PvpBattleData {
  challengerId: string;
  challengerName: string;
  challengerHpMax: number;
  defenderId: string;
  defenderName: string;
  defenderHpMax: number;
  events: PvpTurnEvent[];
  winnerId: string;
  loserId: string;
  totalTurns: number;
  winnerXP: number;
  loserXP: number;
  /** Streak sistemi sonuçları */
  streak?: import('../systems/pvp-streak').StreakUpdateResult;
  /** Savaş sonrası XP ilerleme */
  xpByPlayerId?: Record<string, { level: number; xp: number; gainedXp: number }>;
  /** Bahisli düello — coin ödülü pot üzerinden */
  duelBet?: { bet: number; pot: number; netGain: number };
  /** PNG kart — challenger (sol panel) */
  challengerOwl?: PvpDuelOwlProfile;
  /** PNG kart — defender (sağ panel) */
  defenderOwl?: PvpDuelOwlProfile;
}

/** Gerçek PvP için main owl stat profilleri (PNG kart). */
export async function loadPvpDuelOwlProfiles(
  prisma: PrismaClient,
  challengerId: string,
  defenderId: string,
  challengerName: string,
  defenderName: string,
): Promise<{ challenger: PvpDuelOwlProfile; defender: PvpDuelOwlProfile }> {
  const [chOwl, defOwl] = await Promise.all([
    prisma.owl.findFirst({ where: { ownerId: challengerId, isMain: true }, select: PVP_DUEL_OWL_SELECT }),
    prisma.owl.findFirst({ where: { ownerId: defenderId, isMain: true }, select: PVP_DUEL_OWL_SELECT }),
  ]);
  const mk = (owl: typeof chOwl, fallbackName: string): PvpDuelOwlProfile => ({
    name: fallbackName,
    hpMax: owl?.hpMax ?? 100,
    staminaCur: owl?.staminaCur ?? 80,
    tier: owl?.tier ?? 8,
    statGaga: owl?.statGaga ?? 20,
    statPence: owl?.statPence ?? 20,
    statGoz: owl?.statGoz ?? 20,
    statKulak: owl?.statKulak ?? 20,
    statKanat: owl?.statKanat ?? 20,
  });
  return {
    challenger: mk(chOwl, challengerName),
    defender: mk(defOwl, defenderName),
  };
}

// ─── Yardımcılar ─────────────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

// ─── Flavour ─────────────────────────────────────────────────────────────────
const HIT_LINES   = ['💥 vurdu!', '⚔️ saldırdı!', '🦅 atıldı!', '💢 çarptı!'];
const CRIT_LINES  = ['🔥 **KRİTİK!!**', '⚡ **GÜÇLÜ DARBE!!**', '💥 **MÜKEMMEL!!**'];
const EXEC_LINES  = ['💀 **SON DARBE!!**', '☠️ **BİTİRDİ!!**', '🩸 **EXECUTE!!**'];
const DODGE_LINES = ['🛡️ zayıf darbe...', '💨 kaçındı!', '🌀 savuşturdu!'];

// ─── Log sıkıştırma ───────────────────────────────────────────────────────────
export function compressBattleLog(events: PvpTurnEvent[], maxFrames = 5): PvpTurnEvent[] {
  if (events.length <= maxFrames) return events;

  const important = events.filter((e) => e.isCrit || e.isExecute || e.isLastHit);
  const first     = events[0]!;
  const last      = events[events.length - 1]!;

  const selected = new Set<PvpTurnEvent>([first, ...important.slice(0, maxFrames - 2), last]);
  return [...selected].sort((a, b) => a.turn - b.turn);
}

export function hpAfterEvent(event: PvpTurnEvent, challengerId: string): { challengerHp: number; defenderHp: number } {
  const attackerIsChallenger = event.attackerId === challengerId;
  return {
    challengerHp: attackerIsChallenger ? event.attackerHp : event.defenderHp,
    defenderHp: attackerIsChallenger ? event.defenderHp : event.attackerHp,
  };
}

/** En az minFrames kare; kısa dövüşlerde HP lerp ile doldurulur. */
export function buildDuelAnimFrames(
  events: PvpTurnEvent[],
  challengerId: string,
  challengerHpMax: number,
  defenderHpMax: number,
  minFrames = PVP_BATTLE_ANIM_MIN_FRAMES,
  maxFrames = PVP_BATTLE_ANIM_MAX_FRAMES,
): PvpTurnEvent[] {
  const compressed = compressBattleLog(events, maxFrames);
  if (compressed.length >= minFrames) return compressed;
  const last = events[events.length - 1] ?? compressed[compressed.length - 1];
  if (!last) return compressed;

  const end = hpAfterEvent(last, challengerId);
  const n = minFrames;
  const frames: PvpTurnEvent[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 1) / n;
    const cHp = Math.max(0, Math.round(challengerHpMax + (end.challengerHp - challengerHpMax) * t));
    const dHp = Math.max(0, Math.round(defenderHpMax + (end.defenderHp - defenderHpMax) * t));
    const src = compressed[Math.min(compressed.length - 1, Math.floor((i / n) * compressed.length))] ?? last;
    const attackerIsChallenger = src.attackerId === challengerId;
    frames.push({
      ...src,
      turn: i + 1,
      attackerHp: attackerIsChallenger ? cHp : dHp,
      defenderHp: attackerIsChallenger ? dHp : cHp,
      attackerHpMax: attackerIsChallenger ? challengerHpMax : defenderHpMax,
      defenderHpMax: attackerIsChallenger ? defenderHpMax : challengerHpMax,
      isLastHit: i === n - 1,
    });
  }
  return frames;
}

// ─── Frame builder ───────────────────────────────────────────────────────────
function buildBattleFrame(
  event: PvpTurnEvent,
  data: PvpBattleData,
): string {
  // Attacker challenger mı defender mı?
  const attackerIsChallenger = event.attackerId === data.challengerId;

  const attackerName = attackerIsChallenger ? data.challengerName : data.defenderName;

  // Challenger'ın HP'si: attacker challenger ise attackerHp, değilse defenderHp
  const challengerHp = attackerIsChallenger ? event.attackerHp : event.defenderHp;
  const defenderHp   = attackerIsChallenger ? event.defenderHp : event.attackerHp;

  const actionLine = event.isExecute
    ? `${pickRandom(EXEC_LINES)} **-${event.damage}** HP`
    : event.isCrit
    ? `${pickRandom(CRIT_LINES)} **-${event.damage}** HP`
    : event.damage < 5
    ? `${pickRandom(DODGE_LINES)} **-${event.damage}** HP`
    : `${pickRandom(HIT_LINES)} **-${event.damage}** HP`;

  return [
    `⚔️ **Tur ${event.turn}**`,
    ``,
    `🦉 **${data.challengerName}**`,
    hpBarColored(challengerHp, data.challengerHpMax),
    ``,
    `🦉 **${data.defenderName}**`,
    hpBarColored(defenderHp, data.defenderHpMax),
    ``,
    `> **${attackerName}** ${actionLine}`,
  ].join('\n');
}

// ─── VS ekranı ───────────────────────────────────────────────────────────────
/** Kart görseli HP/stat/isim taşıdığı için üstte tek satırlık eşleşme yazısı yeter. */
function buildVsScreen(data: PvpBattleData): string {
  const leftEmoji = data.challengerOwl
    ? renderOwlMoonEmoji(data.challengerOwl.tier, resolveOwlMoonTierFromStats({
      statGaga: data.challengerOwl.statGaga,
      statPence: data.challengerOwl.statPence,
      statGoz: data.challengerOwl.statGoz,
      statKulak: data.challengerOwl.statKulak,
      statKanat: data.challengerOwl.statKanat,
    }))
    : '🦉';
  const rightEmoji = data.defenderOwl
    ? renderOwlMoonEmoji(data.defenderOwl.tier, resolveOwlMoonTierFromStats({
      statGaga: data.defenderOwl.statGaga,
      statPence: data.defenderOwl.statPence,
      statGoz: data.defenderOwl.statGoz,
      statKulak: data.defenderOwl.statKulak,
      statKanat: data.defenderOwl.statKanat,
    }))
    : '🦉';
  const rightName = data.defenderOwl?.name ?? data.defenderName;
  return `⚔️ **${data.challengerName}** ${leftEmoji}  vs  **${rightName}** ${rightEmoji}`;
}

// ─── Sonuç ekranı ─────────────────────────────────────────────────────────────
export function buildResultScreen(data: PvpBattleData): string {
  const winnerName = data.winnerId === data.challengerId ? data.challengerName : data.defenderName;
  const loserName  = data.loserId  === data.challengerId ? data.challengerName : data.defenderName;
  const s = data.streak;
  const db = data.duelBet;
  const winnerXp = data.xpByPlayerId?.[data.winnerId];
  const winnerCoins = db ? db.netGain : 100 + (s?.bonusCoins ?? 0);

  return buildDuelResultMessage({
    winnerName,
    loserName,
    xpGained: data.winnerXP,
    coinsGained: winnerCoins,
    level: winnerXp?.level ?? 1,
    currentXp: winnerXp?.xp ?? 0,
    totalTurns: data.totalTurns,
    streak: s
      ? { newStreak: s.newStreak, oldStreak: s.oldStreak, streakCounted: s.streakCounted }
      : undefined,
  });
}

/** Tur karelerinde barın erimesini ve hasar balonunu besleyen alanlar. */
interface DuelCardHitFx {
  ghostLeftHp?: number;
  ghostRightHp?: number;
  damageLeft?: number;
  damageRight?: number;
}

/** Önceki tura göre HP farkından hasar balonu + bar izi üretir. */
function hitFxFromHpDelta(
  prevLeftHp: number,
  prevRightHp: number,
  leftHp: number,
  rightHp: number,
): DuelCardHitFx {
  const dmgLeft = Math.max(0, Math.round(prevLeftHp - leftHp));
  const dmgRight = Math.max(0, Math.round(prevRightHp - rightHp));
  return {
    ghostLeftHp: dmgLeft > 0 ? prevLeftHp : undefined,
    ghostRightHp: dmgRight > 0 ? prevRightHp : undefined,
    damageLeft: dmgLeft > 0 ? dmgLeft : undefined,
    damageRight: dmgRight > 0 ? dmgRight : undefined,
  };
}

function buildRealDuelCardPair(
  data: PvpBattleData,
  opts: DuelCardHitFx & {
    leftHp: number;
    rightHp: number;
    energyLeft: number;
    energyRight: number;
    acting?: 'left' | 'right';
    finale?: boolean;
  },
): { left: BattleCardFighter; right: BattleCardFighter } {
  const ch = data.challengerOwl!;
  const def = data.defenderOwl!;
  const chCombat = combatFromParts({
    gaga: ch.statGaga,
    pence: ch.statPence,
    goz: ch.statGoz,
    kulak: ch.statKulak,
    kanat: ch.statKanat,
  });
  const defCombat = combatFromParts({
    gaga: def.statGaga,
    pence: def.statPence,
    goz: def.statGoz,
    kulak: def.statKulak,
    kanat: def.statKanat,
  });
  const chMoon = resolveOwlMoonTierFromStats({
    statGaga: ch.statGaga,
    statPence: ch.statPence,
    statGoz: ch.statGoz,
    statKulak: ch.statKulak,
    statKanat: ch.statKanat,
  });
  const defMoon = resolveOwlMoonTierFromStats({
    statGaga: def.statGaga,
    statPence: def.statPence,
    statGoz: def.statGoz,
    statKulak: def.statKulak,
    statKanat: def.statKanat,
  });
  const finale = Boolean(opts.finale);
  const challengerWon = data.winnerId === data.challengerId;
  const streakNum = data.streak && data.streak.newStreak > 0 ? data.streak.newStreak : undefined;

  return {
    left: {
      name: ch.name,
      hp: Math.max(0, opts.leftHp),
      hpMax: ch.hpMax,
      energy: Math.min(100, opts.energyLeft),
      energyMax: 100,
      ...chCombat,
      tier: ch.tier,
      moon: chMoon,
      streak: finale && challengerWon ? streakNum : undefined,
      winner: finale && challengerWon,
      down: finale && !challengerWon,
      acting: opts.acting === 'left' && !finale,
      portraitKind: 'owl',
      hpGhost: finale ? undefined : opts.ghostLeftHp,
      damage: finale ? undefined : opts.damageLeft,
    },
    right: {
      name: def.name,
      hp: Math.max(0, opts.rightHp),
      hpMax: def.hpMax,
      energy: Math.min(100, opts.energyRight),
      energyMax: 100,
      ...defCombat,
      tier: def.tier,
      moon: defMoon,
      streak: finale && !challengerWon ? streakNum : undefined,
      winner: finale && !challengerWon,
      down: finale && challengerWon,
      acting: opts.acting === 'right' && !finale,
      portraitKind: 'owl',
      hpGhost: finale ? undefined : opts.ghostRightHp,
      damage: finale ? undefined : opts.damageRight,
    },
  };
}

async function animatePvPTextFallback(
  sent: { edit: Function },
  data: PvpBattleData,
): Promise<void> {
  const frames = compressBattleLog(data.events, PVP_BATTLE_ANIM_MAX_FRAMES);
  await sent.edit({ content: buildVsScreen(data), components: [] });
  await sleep(300);
  for (const event of frames) {
    await sleep(150);
    await sent.edit({ content: buildBattleFrame(event, data) }).catch(() => null);
  }
  await sleep(200);
  await sent.edit({ content: buildResultScreen(data) }).catch(() => null);
}

async function showPvPResultMessage(
  sent: { edit: Function },
  data: PvpBattleData,
): Promise<void> {
  const content = buildResultScreen(data);
  if (!data.challengerOwl || !data.defenderOwl) {
    await sent.edit({ content, components: [] }).catch(() => null);
    return;
  }
  const last = data.events[data.events.length - 1];
  const hp = last
    ? hpAfterEvent(last, data.challengerId)
    : {
        challengerHp: data.winnerId === data.challengerId ? 1 : 0,
        defenderHp: data.winnerId === data.challengerId ? 0 : 1,
      };
  const { left, right } = buildRealDuelCardPair(data, {
    leftHp: hp.challengerHp,
    rightHp: hp.defenderHp,
    energyLeft: Math.min(100, data.challengerOwl.staminaCur),
    energyRight: Math.min(100, data.defenderOwl.staminaCur),
    finale: true,
  });
  await editDuelPng(sent, content, left, right);
}

async function animateDuelPngMessage(
  sent: { edit: Function },
  data: PvpBattleData,
  introContent: string,
): Promise<void> {
  if (!data.challengerOwl || !data.defenderOwl) {
    await animatePvPTextFallback(sent, data);
    return;
  }

  if (SIM_PVP_SKIP_ANIM) {
    await showPvPResultMessage(sent, data);
    return;
  }

  const frames = buildDuelAnimFrames(
    data.events,
    data.challengerId,
    data.challengerHpMax,
    data.defenderHpMax,
  );
  const chStamina = data.challengerOwl.staminaCur;
  const defStamina = data.defenderOwl.staminaCur;

  const intro = buildRealDuelCardPair(data, {
    leftHp: data.challengerHpMax,
    rightHp: data.defenderHpMax,
    energyLeft: Math.min(100, chStamina),
    energyRight: Math.min(100, defStamina),
  });
  await editDuelPng(sent, introContent, intro.left, intro.right);
  await sleep(SIM_PVP_ANIM_INTRO_MS);

  let prevLeftHp = data.challengerHpMax;
  let prevRightHp = data.defenderHpMax;

  for (let i = 0; i < frames.length; i++) {
    const event = frames[i]!;
    const hp = hpAfterEvent(event, data.challengerId);
    const isLast = i === frames.length - 1;
    const actingSide = event.attackerId === data.challengerId ? 'left' : 'right';
    const hit = hitFxFromHpDelta(prevLeftHp, prevRightHp, hp.challengerHp, hp.defenderHp);
    const pair = buildRealDuelCardPair(data, {
      leftHp: hp.challengerHp,
      rightHp: hp.defenderHp,
      energyLeft: Math.max(15, Math.min(100, chStamina - event.turn * 8)),
      energyRight: Math.max(15, Math.min(100, defStamina - event.turn * 8)),
      acting: actingSide,
      finale: isLast,
      ...hit,
    });
    prevLeftHp = hp.challengerHp;
    prevRightHp = hp.defenderHp;
    const content = isLast ? buildResultScreen(data) : introContent;
    await sleep(SIM_PVP_ANIM_FRAME_MS);
    await editDuelPng(sent, content, pair.left, pair.right);
  }

  await sleep(SIM_PVP_ANIM_OUTRO_MS);
}

// ─── Ana animasyon: interaction ───────────────────────────────────────────────
export async function animatePvPInteraction(
  interaction: { editReply: Function },
  data: PvpBattleData,
): Promise<void> {
  await animateDuelPngMessage(
    { edit: (payload: unknown) => interaction.editReply(payload) },
    data,
    buildVsScreen(data),
  );
}

// ─── Ana animasyon: message ───────────────────────────────────────────────────
export async function animatePvPMessage(
  sent: { edit: Function },
  data: PvpBattleData,
): Promise<void> {
  await animateDuelPngMessage(sent, data, buildVsScreen(data));
}

// ─── Simüle PvP (Bot Duel) UX ────────────────────────────────────────────────

import type { SimPvpResult } from '../systems/pvp-sim';
import { getOwlPrimaryName, type OwlNameFields } from './owl-display';

/**
 * Simüle PvP için PvpBattleData oluşturur.
 * Gerçek PvP animasyon fonksiyonlarını yeniden kullanır.
 */
export function buildSimBattleData(
  playerId: string,
  playerOwl: OwlNameFields,
  playerHpMax: number,
  result: SimPvpResult,
  ownerDisplayName?: string | null,
): PvpBattleData {
  const playerName = getOwlPrimaryName(playerOwl, ownerDisplayName);
  return {
    challengerId:    playerId,
    challengerName:  playerName,
    challengerHpMax: playerHpMax,
    defenderId:      'bot',
    defenderName:    result.opponent.name,
    defenderHpMax:   result.opponent.hpMax,
    events:          result.events,
    winnerId:        result.playerWon ? playerId : 'bot',
    loserId:         result.playerWon ? 'bot' : playerId,
    totalTurns:      result.turns,
    winnerXP:        result.xpGained,
    loserXP:         result.playerWon ? 0 : result.xpGained,
    streak:          result.playerWon ? {
      newStreak:     result.streak.newStreak,
      oldStreak:     result.streak.oldStreak,
      bestStreak:    result.streak.bestStreak,
      isNewRecord:   result.streak.isNewRecord,
      streakCounted: result.streak.streakCounted,
      xpBonusPct:    result.streak.xpBonusPct,
      bonusCoins:    result.streak.bonusCoins,
      milestoneMsg:  result.streak.milestoneMsg,
    } : undefined,
  };
}

/**
 * Simüle PvP için VS ekranı — kart görselinin üstünde tek satırlık eşleşme yazısı.
 */
export function buildSimVsScreen(
  playerOwl: OwlNameFields,
  _playerHpMax: number,
  result: SimPvpResult,
  ownerDisplayName?: string | null,
): string {
  const playerName = getOwlPrimaryName(playerOwl, ownerDisplayName);
  return `⚔️ **${playerName}**  vs  **${result.opponent.name}**`;
}

type SimDuelOwl = OwlNameFields & {
  hp?: number;
  hpMax?: number;
  staminaCur?: number;
  statGaga?: number;
  statPence?: number;
  statGoz?: number;
  statKulak?: number;
  statKanat?: number;
  tier?: number;
};

/**
 * Simüle PvP animasyonu — interaction versiyonu.
 */
export async function animateSimPvPInteraction(
  interaction: { editReply: Function },
  playerId: string,
  playerOwl: OwlNameFields,
  playerHpMax: number,
  result: SimPvpResult,
  ownerDisplayName?: string | null,
): Promise<void> {
  await animateSimPvPMessage(
    { edit: (payload: unknown) => interaction.editReply(payload) },
    playerId,
    playerOwl as SimDuelOwl,
    playerHpMax,
    result,
    ownerDisplayName,
  );
}

export async function showSimPvPResultInteraction(
  interaction: { editReply: Function },
  result: import('../systems/pvp-sim').SimPvpResult,
  playerOwl: OwlNameFields,
  ownerDisplayName?: string | null,
): Promise<void> {
  await interaction.editReply({
    content: buildSimResultScreen(result, playerOwl, ownerDisplayName),
    components: [],
  }).catch(() => null);
}

function buildSimDuelCardPair(
  result: SimPvpResult,
  playerOwl: SimDuelOwl,
  ownerDisplayName: string | null | undefined,
  opts: DuelCardHitFx & {
    leftHp: number;
    rightHp: number;
    energyLeft: number;
    energyRight: number;
    acting?: 'left' | 'right';
    finale?: boolean;
  },
): { left: BattleCardFighter; right: BattleCardFighter } {
  const playerCombat = combatFromParts({
    gaga: playerOwl.statGaga ?? 20,
    pence: playerOwl.statPence ?? 20,
    goz: playerOwl.statGoz ?? 20,
    kulak: playerOwl.statKulak ?? 20,
    kanat: playerOwl.statKanat ?? 20,
  });
  const oppScale = Math.max(0.5, result.opponent.power / Math.max(1, (playerOwl.statGaga ?? 20) + (playerOwl.statPence ?? 20) + (playerOwl.statKanat ?? 20)));
  const playerMoon = resolveOwlMoonTierFromStats({
    statGaga: playerOwl.statGaga ?? 20,
    statPence: playerOwl.statPence ?? 20,
    statGoz: playerOwl.statGoz ?? 20,
    statKulak: playerOwl.statKulak ?? 20,
    statKanat: playerOwl.statKanat ?? 20,
  });
  const oppSpeciesTier = OWL_SPECIES.find((s) => s.name === result.opponent.species)?.tier
    ?? Math.max(1, Math.min(8, Math.round(8 / Math.max(0.6, oppScale))));
  const finale = Boolean(opts.finale);
  const left: BattleCardFighter = {
    name: getOwlPrimaryName(playerOwl, ownerDisplayName),
    hp: Math.max(0, opts.leftHp),
    hpMax: playerOwl.hpMax ?? 100,
    energy: Math.min(100, opts.energyLeft),
    energyMax: 100,
    ...playerCombat,
    tier: playerOwl.tier ?? 8,
    moon: playerMoon,
    streak: result.playerWon ? result.streak.newStreak : undefined,
    winner: finale && result.playerWon,
    down: finale && !result.playerWon,
    acting: opts.acting === 'left' && !finale,
    portraitKind: 'owl',
    hpGhost: finale ? undefined : opts.ghostLeftHp,
    damage: finale ? undefined : opts.damageLeft,
  };
  const right: BattleCardFighter = {
    name: result.opponent.name,
    hp: Math.max(0, opts.rightHp),
    hpMax: result.opponent.hpMax,
    energy: Math.min(100, opts.energyRight),
    energyMax: 100,
    atk: Math.max(1, Math.round(playerCombat.atk * oppScale)),
    def: Math.max(1, Math.round(playerCombat.def * oppScale * 0.85)),
    spd: Math.max(1, Math.round(playerCombat.spd * oppScale * 0.7)),
    crt: Math.max(1, Math.round(65 * Math.min(1.2, oppScale))),
    tier: oppSpeciesTier,
    moon: Math.min(7, Math.max(1, playerMoon)),
    winner: finale && !result.playerWon,
    down: finale && result.playerWon,
    acting: opts.acting === 'right' && !finale,
    portraitKind: result.opponent.source === 'bot' ? 'mob' : 'owl',
    portraitSeed: result.opponent.name,
    hpGhost: finale ? undefined : opts.ghostRightHp,
    damage: finale ? undefined : opts.damageRight,
  };
  return { left, right };
}

async function editDuelPng(
  sent: { edit: Function },
  content: string,
  left: BattleCardFighter,
  right: BattleCardFighter,
): Promise<void> {
  try {
    const png = await renderBattleCardPng({ left, right });
    await sent.edit({
      content,
      files: [new AttachmentBuilder(png, { name: 'duel.png' })],
      components: [],
    }).catch(() => null);
  } catch {
    await sent.edit({ content, components: [] }).catch(() => null);
  }
}

export async function showSimPvPResultMessage(
  sent: { edit: Function },
  result: import('../systems/pvp-sim').SimPvpResult,
  playerOwl: SimDuelOwl,
  ownerDisplayName?: string | null,
): Promise<void> {
  const content = buildSimResultScreen(result, playerOwl, ownerDisplayName);
  const last = result.events[result.events.length - 1];
  const playerId = last?.attackerId === 'bot' || last?.defenderId === 'bot'
    ? (last.attackerId === 'bot' ? last.defenderId : last.attackerId)
    : '';
  const hp = last && playerId ? hpAfterEvent(last, playerId) : {
    challengerHp: result.playerWon ? 1 : 0,
    defenderHp: result.playerWon ? 0 : 1,
  };
  const { left, right } = buildSimDuelCardPair(result, playerOwl, ownerDisplayName, {
    leftHp: result.playerWon ? Math.max(1, hp.challengerHp) : 0,
    rightHp: result.playerWon ? 0 : Math.max(1, hp.defenderHp),
    energyLeft: Math.min(100, playerOwl.staminaCur ?? 80),
    energyRight: Math.min(100, result.opponent.stamina),
    finale: true,
  });
  await editDuelPng(sent, content, left, right);
}

export async function animateSimPvPMessage(
  sent: { edit: Function },
  playerId: string,
  playerOwl: SimDuelOwl,
  playerHpMax: number,
  result: SimPvpResult,
  ownerDisplayName?: string | null,
): Promise<void> {
  if (SIM_PVP_SKIP_ANIM) {
    await showSimPvPResultMessage(sent, result, playerOwl, ownerDisplayName);
    return;
  }

  const frames = buildDuelAnimFrames(
    result.events,
    playerId,
    playerHpMax,
    result.opponent.hpMax,
  );
  const vsContent = buildSimVsScreen(playerOwl, playerHpMax, result, ownerDisplayName);

  const intro = buildSimDuelCardPair(result, playerOwl, ownerDisplayName, {
    leftHp: playerHpMax,
    rightHp: result.opponent.hpMax,
    energyLeft: Math.min(100, playerOwl.staminaCur ?? 80),
    energyRight: Math.min(100, result.opponent.stamina),
  });
  await editDuelPng(sent, vsContent, intro.left, intro.right);
  await sleep(SIM_PVP_ANIM_INTRO_MS);

  let prevLeftHp = playerHpMax;
  let prevRightHp = result.opponent.hpMax;

  for (let i = 0; i < frames.length; i++) {
    const event = frames[i]!;
    const hp = hpAfterEvent(event, playerId);
    const isLast = i === frames.length - 1;
    const hit = hitFxFromHpDelta(prevLeftHp, prevRightHp, hp.challengerHp, hp.defenderHp);
    const pair = buildSimDuelCardPair(result, playerOwl, ownerDisplayName, {
      leftHp: hp.challengerHp,
      rightHp: hp.defenderHp,
      energyLeft: Math.max(15, Math.min(100, (playerOwl.staminaCur ?? 80) - event.turn * 8)),
      energyRight: Math.max(15, Math.min(100, result.opponent.stamina - event.turn * 8)),
      acting: event.attackerId === playerId ? 'left' : 'right',
      finale: isLast,
      ...hit,
    });
    prevLeftHp = hp.challengerHp;
    prevRightHp = hp.defenderHp;
    const content = isLast
      ? buildSimResultScreen(result, playerOwl, ownerDisplayName)
      : vsContent;
    await sleep(SIM_PVP_ANIM_FRAME_MS);
    await editDuelPng(sent, content, pair.left, pair.right);
  }

  await sleep(SIM_PVP_ANIM_OUTRO_MS);
}

/**
 * Simüle PvP sonuç ekranı (kritik yol — tek edit).
 */
export function buildSimResultScreen(
  result: SimPvpResult,
  playerOwl: OwlNameFields,
  ownerDisplayName?: string | null,
): string {
  const playerName = getOwlPrimaryName(playerOwl, ownerDisplayName);

  if (result.playerWon) {
    return buildDuelResultMessage({
      winnerName: playerName,
      loserName: result.opponent.name,
      xpGained: result.xpGained,
      coinsGained: result.coinsGained,
      level: result.levelAfter,
      currentXp: result.xpAfter,
      totalTurns: result.turns,
      streak: {
        newStreak: result.streak.newStreak,
        oldStreak: result.streak.oldStreak,
        streakCounted: result.streak.streakCounted,
        xpBonusPct: result.streak.xpBonusPct,
        bonusCoins: result.streak.bonusCoins,
      },
    });
  }

  return buildDuelResultMessage({
    winnerName: result.opponent.name,
    loserName: playerName,
    xpGained: result.xpGained,
    coinsGained: result.coinsGained,
    level: result.levelAfter,
    currentXp: result.xpAfter,
    totalTurns: result.turns,
  });
}

// buildBattleFrame ve sleep fonksiyonlarına erişim için — bu dosyada zaten tanımlı
