/**
 * drop-rates-ux.ts — Drop oranı şeffaflığı ekranı (A4).
 *
 * Oranları elle yazmaz; `src/config.ts` ve `config/drop-transparency.ts`
 * içindeki gerçek sabitlerden türetir. Böylece balance değişince ilan edilen
 * tablo otomatik güncellenir ve oyuncuya yanlış oran gösterilmez.
 */

import { EmbedBuilder } from 'discord.js';
import {
  LOOTBOX_CRIT_MULT,
  LOOTBOX_DEFS,
  LOOTBOX_ENCOUNTER_FIGHT_CHANCE,
  LOOTBOX_ENCOUNTER_WIN_CHANCE,
  LOOTBOX_HUNT_DROP_CHANCE,
  LOOTBOX_PVP_WIN_CHANCE,
  type LootboxDef,
  type LootboxTier,
} from '../config';
import { displayLootboxEmoji } from '../config/custom-emojis';
import {
  LOOTBOX_DAILY_DROP_CAP,
  LOOTBOX_LEVEL_SOFTCAP_MAX,
  LOOTBOX_LEVEL_SOFTCAP_START,
} from '../config/drop-transparency';
import { COLORS } from './theme';

/** Tier sırası — tabloda hep aynı sırada görünsün. */
const TIER_ORDER: readonly LootboxTier[] = ['Eşya', 'Silah'];

function tierIcon(tier: LootboxTier): string {
  const def = LOOTBOX_DEFS.find((l) => l.tier === tier);
  return def ? displayLootboxEmoji(def) : '📦';
}

function tierLabel(tier: LootboxTier): string {
  const def = LOOTBOX_DEFS.find((l) => l.tier === tier);
  return `${tierIcon(tier)} ${def?.name ?? tier}`;
}

/** `%12` / `%5` biçimi — tam sayıysa ondalık gösterme. */
function pct(value: number): string {
  return Number.isInteger(value) ? `%${value}` : `%${value.toFixed(1)}`;
}

function buildSourceLines(
  chances: Record<LootboxTier, number>,
): string[] {
  return TIER_ORDER.map((tier) => `${tierLabel(tier)} ${pct(chances[tier])}`);
}

/** Kutu içeriği rarity dağılımı — ağırlıkları yüzdeye çevirir. */
function buildContentLine(def: LootboxDef): string {
  const total = def.weights.reduce((sum, w) => sum + w.weight, 0);
  const parts = def.weights
    .filter((w) => w.weight > 0)
    .map((w) => `${w.rarity} ${pct(Math.round((w.weight / total) * 100))}`);
  return `${displayLootboxEmoji(def)} **${def.name}** — ${parts.join(' · ')}`;
}

/** Pity satırı — kaç kutuda garanti Rare+ geldiğini söyler. */
function buildPityLine(def: LootboxDef): string {
  return `${displayLootboxEmoji(def)} **${def.name}** — ${def.pityThreshold} kutu üst üste Rare+ gelmezse sonraki kutu garanti Rare+`;
}

/**
 * Drop oranı şeffaflık embed'i.
 *
 * Kaynak bazında lootbox düşme şansı, kutu içi rarity dağılımı, pity eşikleri
 * ve oranı etkileyen iki sınır (günlük cap + seviye softcap) tek ekranda.
 *
 * @param prefix Sunucu komut prefix'i
 */
export function buildDropRatesEmbed(prefix: string): EmbedBuilder {
  const p = prefix;

  const softcapNote =
    `Lv.${LOOTBOX_LEVEL_SOFTCAP_START}'e kadar oranlar tam. ` +
    `Sonrasında her seviye kutu şansını biraz düşürür, en fazla ${pct(LOOTBOX_LEVEL_SOFTCAP_MAX * 100)}. ` +
    `Hiç durmaz, yavaşlar.`;

  return new EmbedBuilder()
    .setColor(COLORS.RARE)
    .setTitle('📦 Drop Oranları')
    .setDescription('Gerçek oranlar — kodun kullandığı sayılar.')
    .addFields(
      {
        name: '🌿 Avdan',
        value:
          `${buildSourceLines(LOOTBOX_HUNT_DROP_CHANCE).join('\n')}\n` +
          `-# Kritik avda bu şans ×${LOOTBOX_CRIT_MULT}`,
        inline: true,
      },
      {
        name: '⚔️ PvP kazanınca',
        value: buildSourceLines(LOOTBOX_PVP_WIN_CHANCE).join('\n'),
        inline: true,
      },
      {
        name: '🦉 Encounter savaşı',
        value: buildSourceLines(LOOTBOX_ENCOUNTER_FIGHT_CHANCE).join('\n'),
        inline: true,
      },
      {
        name: '🪶 Encounter tame',
        value: buildSourceLines(LOOTBOX_ENCOUNTER_WIN_CHANCE).join('\n'),
        inline: true,
      },
      {
        name: '🎁 Kutu içinden ne çıkar',
        value: LOOTBOX_DEFS.map(buildContentLine).join('\n'),
        inline: false,
      },
      {
        name: '🛟 Pity — kötü şans koruması',
        value:
          `${LOOTBOX_DEFS.map(buildPityLine).join('\n')}\n` +
          `-# Kutu sayacı \`${p} aç\` ekranında.`,
        inline: false,
      },
      {
        name: '📊 Oranı etkileyen sınırlar',
        value:
          `Günde en fazla **${LOOTBOX_DAILY_DROP_CAP}** kutu düşer.\n` +
          softcapNote,
        inline: false,
      },
    )
    .setFooter({ text: `Ana menü: ${p} yardim` });
}
