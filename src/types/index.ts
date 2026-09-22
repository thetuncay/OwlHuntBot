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
  /** Level-up ödülü (coin + lootbox + item) */
  reward?: {
    coins: number;
    lootboxName?: string;
    lootboxEmoji?: string;
    lootbox2Name?: string;
    lootbox2Emoji?: string;
    itemName?: string;
    message?: string;
  };
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
  /** D1 — boş avda verilen taban yakalama. */
  guaranteed?: boolean;
}

export interface HuntRunResult {
  catches: HuntCatchResult[];
  escaped: HuntCatchResult[];
  injured: HuntCatchResult[];
  totalXP: number;
  levelUp?: LevelUpResult;
  /** Side-effect ve follow-up için oyuncu snapshot'ı */
  playerSnapshot?: {
    level: number;
    prestigeLevel?: number;
  };
  /** Side-effect ve follow-up için main owl snapshot'ı */
  owlSnapshot?: {
    id: string;
    species: string;
    tier: number;
    quality: string;
    hp: number;
    hpMax: number;
    statGoz: number;
    statKulak: number;
    statGaga: number;
    statKanat: number;
    statPence: number;
    staminaCur?: number;
  };
  /** Aktif buff satiri (hunt mesajinda) */
  activeBuffs?: { emoji: string; chargeCur: number; chargeMax: number }[];
  /** Av sonrası oluşan encounter ID (varsa) */
  encounterId?: string;
  /** Encounter kritik yol dışı — caller UI öncesi await eder */
  resolveEncounter?: Promise<string | null>;
  /** Bu avda düşen lootbox'lar (varsa) */
  lootboxDrops?: LootboxDrop[];
  /** Av sonrası hunt combo streak */
  huntComboStreak?: number;
  /** XP kazanımı sonrası oyuncu seviyesi (ilerleme çubuğu) */
  levelAfter?: number;
  xpAfter?: number;
  /** Kritik yol dışı görev takibi için payload */
  questTrackPayload?: import('../systems/quest-tracker').HuntQuestTrackPayload;
  /** Birleşik av serisi (milestone + XP çarpanı). */
  huntMilestone?: import('../systems/hunt-milestones').HuntMilestoneTickResult;
  /** Saat penceresi satırı (N2). */
  timeOfDayLine?: string;
  timeXpMult?: number;
  timeRareBonus?: number;
  /** Micro-event (B1). */
  microEventLine?: string;
  microEventXp?: number;
  /** Yalnızca garanti av düştüyse. */
  guaranteedCatch?: boolean;
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
  /** Kazananın baykuşu effectiveness %50 altındaysa true — tamir uyarısı */
  effectivenessWarning?: boolean;
  /** Savaş sonrası XP ilerleme (oyuncu id → durum) */
  xpByPlayerId?: Record<string, { level: number; xp: number; gainedXp: number }>;
}

export interface GambleResult {
  win: boolean;
  deltaCoins: number;
  finalCoins: number;
  message: string;
  slotSymbolKey?: string;
  slotSymbolKeys?: [string, string, string];
  slotLabel?: string;
  slotJackpot?: boolean;
  /**
   * Kayıp serisi koruması aktifse gösterilecek satır (M2).
   * Koruma mekaniği zaten vardı; bu alan onu görünür kılar.
   */
  lossReliefNote?: string;
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
  upgradeBonus:     number;   // @deprecated — use upgradeCoinDiscount
  upgradeCoinDiscount: number; // 0.10 = %10 coin indirimi (cap 0.25)
  downgradeShield:  number;   // geriye uyumluluk — garanti upgrade'de kullanılmaz
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
  /** Buff'ın ne işe yaradığının kısa açıklaması */
  effectDescription: string;
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
