import type { ChatInputCommandInteraction } from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import type { StreakUpdateResult } from '../systems/pvp-streak';

export type OwlStatKey = 'gaga' | 'goz' | 'kulak' | 'kanat' | 'pence';

export interface CommandContext {
  prisma: PrismaClient;
  redis: Redis;
}

export interface CommandData {
  name: string;
  toJSON: () => unknown;
}

export interface CommandDefinition {
  data: CommandData;
  execute: (interaction: ChatInputCommandInteraction, ctx: CommandContext) => Promise<void>;
}

export interface LevelUpResult {
  oldLevel: number;
  newLevel: number;
  remainingXP: number;
}

export interface XpApplyResult {
  gainedXP: number;
  currentXP: number;
  currentLevel: number;
  levelUp?: LevelUpResult;
}

export interface HuntCatchResult {
  preyName: string;
  difficulty: number;
  success: boolean;
  critical: boolean;
  xp: number;
}

export interface HuntRunResult {
  catches: HuntCatchResult[];
  escaped: HuntCatchResult[];
  injured: HuntCatchResult[];
  totalXP: number;
  levelUp?: LevelUpResult;
  /** Av sonrası oluşan encounter ID (varsa) */
  encounterId?: string;
  /** Bu avda düşen lootbox'lar (varsa) */
  lootboxDrops?: LootboxDrop[];
}

export interface PvpSimResult {
  sessionId: string;
  winnerId: string;
  loserId: string;
  turns: number;
  log: string[];
  events: import('../utils/pvp-ux').PvpTurnEvent[];
  challengerHpMax: number;
  defenderHpMax: number;
  /** Streak sistemi sonuçları */
  streak: StreakUpdateResult;
  /** Kazananın aldığı toplam XP (streak bonusu dahil) */
  winnerXP: number;
}

export interface GambleResult {
  win: boolean;
  deltaCoins: number;
  finalCoins: number;
  message: string;
}

// ── BUFF ITEM SİSTEMİ TİPLERİ ────────────────────────────────────────────────

/** DB'de saklanan aktif buff kaydı (PlayerBuff tablosu) */
export interface ActiveBuff {
  id:          string;
  playerId:    string;
  buffItemId:  string;   // BUFF_ITEMS[].id
  category:    string;   // 'hunt' | 'upgrade' | 'pvp'
  effectType:  string;
  effectValue: number;
  chargeMax:   number;
  chargeCur:   number;   // 0 = pasif (item silinmez, sadece etkisiz)
  createdAt:   Date;
}

/** Bir sistemde uygulanacak buff etkilerinin özeti */
export interface BuffEffects {
  catchBonus:       number;   // flat ekleme (0.08 = +8%)
  lootMult:         number;   // çarpan (1.35 = +35%)
  rareDropBonus:    number;   // flat ekleme (0.10 = +10%)
  upgradeBonus:     number;   // flat puan (+8)
  downgradeShield:  number;   // çarpan (0.5 = %50 azalır)
  pvpDamageMult:    number;   // çarpan (1.12 = +12%)
  pvpDodgeBonus:    number;   // flat ekleme (0.08 = +8%)
}

/** Buff kullanım sonucu */
export interface BuffUseResult {
  buffItemId:  string;
  buffName:    string;
  chargeCur:   number;
  chargeMax:   number;
  depleted:    boolean;   // true = charge bitti, buff pasifleşti (silinmedi)
}

/** Lootbox açma sonucu */
export interface LootboxOpenResult {
  lootboxId:   string;
  lootboxName: string;
  items:       { buffItemId: string; buffName: string; rarity: string; emoji: string }[];
  pityTriggered: boolean;
}

/** Hunt sonucuna eklenen lootbox drop bilgisi */
export interface LootboxDrop {
  lootboxId:   string;
  lootboxName: string;
  emoji:       string;
}
