/**
 * rune-ux.ts — Rün Discord satırları / embed / text.
 */

import { EmbedBuilder } from 'discord.js';
import { renderEmoji } from '../config/custom-emojis';
import {
  RUNE_DEFS,
  RUNE_RARITY_EMOJI_KEY,
  RUNE_RARITY_FALLBACK_EMOJI,
  RUNE_STAT_MAP,
  RUNE_UNKNOWN_EMOJI_KEY,
  type RuneBonuses,
  type RuneCombatStat,
  type RuneDef,
  type RuneRarity,
} from '../config/runes';

const STAT_LABEL: Record<string, string> = {
  pence: 'Pençe',
  gaga: 'Gaga',
  kanat: 'Kanat',
  goz: 'Göz',
};

/**
 * Rün özel emojisi (yoksa fallback).
 *
 * @param def Rün
 */
export function renderRuneEmoji(def: RuneDef): string {
  return renderEmoji(def.emojiKey, def.fallbackEmoji);
}

/**
 * Bulunmamış rün — klasik `?` yerine `soru` (yoksa ❓).
 */
export function renderUnknownRuneEmoji(): string {
  return renderEmoji(RUNE_UNKNOWN_EMOJI_KEY, '❓');
}

/**
 * Rarity başlık emojisi (katalog).
 *
 * @param rarity Yaygın…Efsanevi
 */
export function renderRuneRarityEmoji(rarity: RuneRarity): string {
  return renderEmoji(
    RUNE_RARITY_EMOJI_KEY[rarity],
    RUNE_RARITY_FALLBACK_EMOJI[rarity],
  );
}

/**
 * Liste satırı emojisi — her zaman rün emojisi (katalog ile aynı).
 *
 * @param def Rün
 * @param _quantity Envanter adedi (emoji seçimini etkilemez)
 */
export function renderRuneListEmoji(def: RuneDef, _quantity: number): string {
  return renderRuneEmoji(def);
}

/**
 * Drop satırı: `{emoji} **{Ad}** düştü!`
 *
 * @param def Rün
 */
export function formatRuneDropLine(def: RuneDef): string {
  return `${renderRuneEmoji(def)} **${def.name}** düştü!`;
}

/**
 * Bonusları kısa metin.
 *
 * @param bonuses Bonuslar
 */
export function formatRuneBonusLine(bonuses: RuneBonuses): string {
  const parts: string[] = [];
  for (const key of ['ATK', 'DEF', 'SPD', 'CRT'] as RuneCombatStat[]) {
    const n = bonuses[key];
    if (!n) continue;
    const owlStat = RUNE_STAT_MAP[key];
    parts.push(`+${n} ${STAT_LABEL[owlStat] ?? key}`);
  }
  return parts.join(' · ');
}

/**
 * `w rün` düz metin — embed değil.
 *
 * @param owned Sahip olunan (qty>0)
 * @param appliedCount Main +N
 * @param prefix Komut prefix
 */
export function buildRuneInventoryText(
  owned: Array<{ def: RuneDef; quantity: number }>,
  appliedCount: number,
  prefix: string,
): string {
  const qtyById = new Map(owned.map(({ def, quantity }) => [def.id, quantity]));

  const lines = RUNE_DEFS.map((def) => {
    const quantity = qtyById.get(def.id) ?? 0;
    const emoji = renderRuneListEmoji(def, quantity);
    return `\`${def.id}\` ${emoji} **${def.name}** ×${quantity}`;
  });

  return [
    `🔮 **RÜN**  ·  Main +${appliedCount}`,
    '',
    ...lines,
    '',
    `↳ \`${prefix} rün 040\` · \`${prefix} katalog rün\``,
  ].join('\n');
}

/**
 * @deprecated Embed kaldırıldı — buildRuneInventoryText kullan.
 */
export function buildRuneInventoryEmbed(
  owned: Array<{ def: RuneDef; quantity: number }>,
  appliedCount: number,
  prefix: string,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x9b59b6)
    .setDescription(buildRuneInventoryText(owned, appliedCount, prefix));
}

/**
 * Katalog — tüm rünler + rarity custom emoji.
 *
 * @param prefix Komut prefix
 */
export function buildRuneCatalogEmbed(prefix: string): EmbedBuilder {
  const byRarity = new Map<string, RuneDef[]>();
  for (const def of RUNE_DEFS) {
    const list = byRarity.get(def.rarity) ?? [];
    list.push(def);
    byRarity.set(def.rarity, list);
  }

  const embed = new EmbedBuilder()
    .setColor(0x8e44ad)
    .setTitle('🔮 Rün Kataloğu')
    .setDescription('Tek kullanımlık · main’e kalıcı stat · başarısızlık yok');

  for (const rarity of ['Yaygın', 'Ender', 'Nadir', 'Efsanevi'] as const) {
    const list = byRarity.get(rarity);
    if (!list?.length) continue;
    const mark = renderRuneRarityEmoji(rarity);
    const value = list
      .map((d) => `\`${d.id}\` ${renderRuneEmoji(d)} **${d.name}**\n${formatRuneBonusLine(d.bonuses)}`)
      .join('\n\n');
    embed.addFields({ name: `${mark} ${rarity}`, value, inline: false });
  }

  embed.setFooter({ text: `${prefix} rün · ${prefix} rün 040` });
  return embed;
}

/**
 * Apply başarı mesajı.
 *
 * @param def Rün
 * @param appliedCount Yeni toplam
 */
export function formatRuneApplyMessage(def: RuneDef, appliedCount: number): string {
  const emoji = renderRuneEmoji(def);
  return (
    `${emoji} **${def.name}** · main’e uygulandı\n` +
    `${formatRuneBonusLine(def.bonuses)}\n` +
    `Main **+${appliedCount}**`
  );
}
