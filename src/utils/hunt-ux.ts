import type { HuntRunResult } from '../types';
import { formatXpCoinPair } from '../config/ui-emojis';
import { HUNT_HIGH_TIER_THRESHOLD, PREY, PREY_MIN_SELL_PRICE } from '../config';
import { renderPreyEmoji } from '../config/custom-emojis';
import { momentMarker } from '../config/moment-highlights';
import { chargeBadge } from './theme';
import { RESULT_COL } from './result-ux';

const PREY_SELL: Record<string, number> = Object.fromEntries(
  PREY.map((p) => [p.name, p.sellPrice]),
);

const COL = RESULT_COL;

export interface CompressedHunt {
  groups: {
    name: string;
    emoji: string;
    count: number;
    sellPrice: number;
    totalValue: number;
    /** `true` ise yüksek tier av — çıktıda görsel işaret alır (L3). */
    rare: boolean;
  }[];
  totalXP: number;
  totalValue: number;
  hasCritical: boolean;
  hasRareCatch: boolean;
  levelUp: { oldLevel: number; newLevel: number; reward?: { coins: number; lootboxName?: string; lootboxEmoji?: string; lootbox2Name?: string; lootbox2Emoji?: string; itemName?: string; message?: string } } | null;
  isEmpty: boolean;
  encounterId?: string;
  activeBuffs?: { emoji: string; chargeCur: number; chargeMax: number }[];
  huntComboStreak?: number;
  levelAfter?: number;
  xpAfter?: number;
  /** Av serisi: `7/25` */
  huntMilestoneProgress?: string;
  /**
   * `true` ise hedefe kalan av sayısı yaklaşım eşiğinin altında (A2 vurgu).
   * `false` veya `undefined` ise ince satır render edilir.
   */
  huntMilestoneApproaching?: boolean;
  /** Kilometre taşı ödül satırı */
  huntMilestoneRewardLine?: string;
  /** Av serisi XP çarpanı aktifse yüzde (5 / 10). */
  huntSeriesXpBonusPct?: number;
}

export function compressHuntResult(result: HuntRunResult): CompressedHunt {
  const counts = new Map<string, {
    name: string; count: number; order: number; sellPrice: number; rare: boolean;
  }>();

  let order = 0;
  for (const c of result.catches) {
    const existing = counts.get(c.preyName);
    if (existing) {
      existing.count++;
    } else {
      counts.set(c.preyName, {
        name: c.preyName,
        count: 1,
        order: order++,
        sellPrice: PREY_SELL[c.preyName] ?? PREY_MIN_SELL_PRICE,
        rare: c.difficulty >= HUNT_HIGH_TIER_THRESHOLD,
      });
    }
  }

  const isEmpty = counts.size === 0;

  const sorted = [...counts.values()].sort((a, b) => a.order - b.order);
  const groups = sorted.slice(0, 8).map((g) => ({
    name: g.name,
    emoji: renderPreyEmoji(g.name),
    count: g.count,
    sellPrice: g.sellPrice,
    totalValue: g.sellPrice * g.count,
    rare: g.rare,
  }));

  const totalValue = groups.reduce((s, g) => s + g.totalValue, 0);
  const hasCritical = result.catches.some((c) => c.critical);
  const hasRareCatch = result.catches.some(
    (c) => c.difficulty >= HUNT_HIGH_TIER_THRESHOLD,
  );

  return {
    groups,
    totalXP: result.totalXP,
    totalValue,
    hasCritical,
    hasRareCatch,
    levelUp: result.levelUp
      ? { oldLevel: result.levelUp.oldLevel, newLevel: result.levelUp.newLevel, reward: result.levelUp.reward }
      : null,
    isEmpty,
    encounterId: result.encounterId,
    activeBuffs: result.activeBuffs,
    huntComboStreak: result.huntComboStreak,
    levelAfter: result.levelAfter,
    xpAfter: result.xpAfter,
  };
}

/**
 * Ganimet satırı. Nadir avlar işaretle öne çıkar (L3) — oyuncu hangi
 * yakalayışın özel olduğunu ayrı bir açıklama satırı olmadan görür.
 */
function formatLootLine(groups: CompressedHunt['groups']): string {
  if (groups.length === 0) return `${COL} —`;
  const rareMarker = momentMarker('rare-prey');
  const parts = groups.map((g) =>
    g.rare ? `${rareMarker}${g.emoji}×${g.count}` : `${g.emoji}×${g.count}`,
  );
  return `${COL}${parts.join(' ')}`;
}

function formatRewardsLine(totalXP: number, totalCoin: number): string {
  const xp = Math.trunc(totalXP);
  const coin = Math.trunc(totalCoin);
  return `${COL} ${formatXpCoinPair(xp, coin)}`;
}

function formatBuffLine(
  buffs: NonNullable<CompressedHunt['activeBuffs']>,
): string {
  const parts = buffs.map((b) => `${b.emoji}${chargeBadge(b.chargeCur, b.chargeMax)}`);
  return `${COL}${parts.join('   ')}`;
}

/** Hunt sonucu — düz metin */
export function buildFinalMessage(name: string, compressed: CompressedHunt, _prefix = 'w'): string {
  const lines: string[] = [`🌙 ${name}, avdan döndü.`];

  const activeBuffs = compressed.activeBuffs?.filter((b) => b.chargeCur > 0) ?? [];
  if (activeBuffs.length > 0) {
    lines.push(formatBuffLine(activeBuffs));
  }

  lines.push(formatLootLine(compressed.groups));
  lines.push(formatRewardsLine(compressed.totalXP, compressed.totalValue));

  if (compressed.huntMilestoneProgress) {
    const bonus =
      compressed.huntSeriesXpBonusPct && compressed.huntSeriesXpBonusPct > 0
        ? ` · +%${compressed.huntSeriesXpBonusPct} XP`
        : '';
    if (compressed.huntMilestoneApproaching) {
      lines.push(`${COL} 🏁 Av serisi **${compressed.huntMilestoneProgress}** · yakında ödül${bonus}`);
    } else {
      lines.push(`${COL} Av serisi **${compressed.huntMilestoneProgress}**${bonus}`);
    }
  }
  if (compressed.huntMilestoneRewardLine) {
    lines.push(compressed.huntMilestoneRewardLine);
  }

  return lines.join('\n');
}

export async function animateHuntInteraction(
  interaction: { reply?: Function; editReply: Function },
  name: string,
  compressed: CompressedHunt,
  prefix = 'w',
): Promise<void> {
  const final = buildFinalMessage(name, compressed, prefix);
  if (interaction.reply) {
    await interaction.reply({ content: final });
  } else {
    await interaction.editReply({ content: final });
  }
}

export async function animateHuntMessage(
  message: { reply: Function },
  name: string,
  compressed: CompressedHunt,
  prefix = 'w',
): Promise<void> {
  const final = buildFinalMessage(name, compressed, prefix);
  await message.reply(final);
}
