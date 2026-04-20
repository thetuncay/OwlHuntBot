// placeholder

import type Redis from 'ioredis';
import type { OwlPersonality, TameAction } from '../utils/tame-narrative';
import { rollPersonality, ACTION_MODIFIERS, ESCAPE_MODIFIERS } from '../utils/tame-narrative';
import { TAME_BASE_CHANCE, QUALITY_TAME_ADJ } from '../config';
import { tameChance } from '../utils/math';

// ─── SESSION STATE ────────────────────────────────────────────────────────────
export interface TameSessionState {
  encounterId:  string;
  playerId:     string;
  owlSpecies:   string;
  owlTier:      number;
  owlQuality:   string;
  personality:  OwlPersonality;
  aggression:   number;
  awareness:    number;
  patience:     number;
  greed:        number;
  personalityLabel: string;
  personalityEmoji: string;
  progress:     number;   // 0-100, 100 = tame
  escapeRisk:   number;   // 0-100, 100 = kaçtı
  turn:         number;   // 1-4
  maxTurns:     number;
  usedLines:    string[]; // anti-repetition
  playerGoz:    number;
  playerKulak:  number;
  baseChance:   number;
}

const SESSION_TTL = 300; // 5 dakika
const SESSION_KEY = (userId: string) => `tame_session:${userId}`;

export async function createTameSession(
  redis: Redis,
  encounterId: string,
  playerId: string,
  owlSpecies: string,
  owlTier: number,
  owlQuality: string,
  playerGoz: number,
  playerKulak: number,
): Promise<TameSessionState> {
  const profile = rollPersonality(owlTier, owlQuality);
  const baseChance = TAME_BASE_CHANCE[owlTier] ?? 50;
  const qualityAdj = QUALITY_TAME_ADJ[owlQuality] ?? 0;
  const finalBase  = tameChance(baseChance, playerGoz, playerKulak, 0, qualityAdj);

  const state: TameSessionState = {
    encounterId,
    playerId,
    owlSpecies,
    owlTier,
    owlQuality,
    personality:       profile.type,
    aggression:        profile.traits.aggression,
    awareness:         profile.traits.awareness,
    patience:          profile.traits.patience,
    greed:             profile.traits.greed,
    personalityLabel:  profile.label,
    personalityEmoji:  profile.emoji,
    progress:          0,
    escapeRisk:        20,
    turn:              1,
    maxTurns:          4,
    usedLines:         [],
    playerGoz,
    playerKulak,
    baseChance:        finalBase,
  };

  await redis.set(SESSION_KEY(playerId), JSON.stringify(state), 'EX', SESSION_TTL);
  return state;
}

export async function getTameSession(redis: Redis, playerId: string): Promise<TameSessionState | null> {
  const raw = await redis.get(SESSION_KEY(playerId));
  if (!raw) return null;
  return JSON.parse(raw) as TameSessionState;
}

export async function updateTameSession(redis: Redis, state: TameSessionState): Promise<void> {
  await redis.set(SESSION_KEY(state.playerId), JSON.stringify(state), 'EX', SESSION_TTL);
}

export async function deleteTameSession(redis: Redis, playerId: string): Promise<void> {
  await redis.del(SESSION_KEY(playerId));
}

// ─── TURN RESOLUTION ─────────────────────────────────────────────────────────
export interface TurnResult {
  progressDelta: number;
  escapeDelta:   number;
  outcome:       'success' | 'fail' | 'critical_success' | 'critical_fail' | 'escape' | 'ongoing';
  tamed:         boolean;
  escaped:       boolean;
}

export function resolveTurn(state: TameSessionState, action: TameAction): TurnResult {
  const actionBonus  = ACTION_MODIFIERS[state.personality][action];
  const escapeDelta  = ESCAPE_MODIFIERS[state.personality][action];

  // Progress roll: baseChance + actionBonus ± variance
  const variance     = (Math.random() - 0.5) * 20; // ±10
  const roll         = state.baseChance + actionBonus + variance;
  const isCritical   = Math.random() < 0.08; // 8% critical chance

  let progressDelta: number;
  let outcome: TurnResult['outcome'];

  if (roll > 60) {
    // Güçlü başarı — tier'a göre ölçeklenmiş kazanım
    const base = 20 + Math.floor((state.baseChance / 92) * 20); // 20–40 arası
    progressDelta = isCritical ? base + 20 : base + Math.floor(Math.random() * 10);
    outcome       = isCritical ? 'critical_success' : 'success';
  } else if (roll > 35) {
    // Orta başarı
    const base = 10 + Math.floor((state.baseChance / 92) * 10); // 10–20 arası
    progressDelta = base + Math.floor(Math.random() * 5);
    outcome       = 'success';
  } else {
    // Başarısız
    progressDelta = isCritical ? -40 : -10 - Math.floor(Math.random() * 10);
    outcome       = isCritical ? 'critical_fail' : 'fail';
  }

  const newProgress   = Math.max(0, Math.min(100, state.progress + progressDelta));
  const newEscapeRisk = Math.max(0, Math.min(100, state.escapeRisk + escapeDelta));

  // Escape check (tur 2'den itibaren)
  const escaped = Math.random() * 100 < newEscapeRisk && state.turn >= 2;
  if (escaped) {
    return { progressDelta, escapeDelta, outcome: 'escape', tamed: false, escaped: true };
  }

  // Tame eşiği: tier 1 = 80, tier 8 = 50 (yüksek tier daha zor)
  const tameThreshold = Math.max(50, 85 - state.owlTier * 5);
  const tamed = newProgress >= tameThreshold;
  if (tamed) {
    return { progressDelta, escapeDelta, outcome: isCritical ? 'critical_success' : 'success', tamed: true, escaped: false };
  }

  // Son tur ve tame olmadı
  if (state.turn >= state.maxTurns && !tamed) {
    return { progressDelta, escapeDelta, outcome: 'fail', tamed: false, escaped: false };
  }

  return { progressDelta, escapeDelta, outcome, tamed: false, escaped: false };
}
