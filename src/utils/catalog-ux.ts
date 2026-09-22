/**
 * catalog-ux.ts — Oyun kataloğu (buff + materyal rehberi)
 */

import { EmbedBuilder } from 'discord.js';
import {
  BUFF_ITEMS,
  HUNT_ITEM_DROPS,
  MATERIAL_USE_IDS,
  UPGRADE_COST,
  UPGRADE_ITEM_BONUS,
  type BuffItemDef,
} from '../config';
import { COLORS, RARITY_BADGE } from './theme';
import { displayBuffEmoji, renderItemEmoji } from '../config/custom-emojis';

const STAT_FOR_MATERIAL: Record<string, { key: string; label: string; icon: string }> = {
  'Kemik Tozu':            { key: 'gaga',  label: 'Gaga',  icon: '🦷' },
  'Av Gözü Kristali':      { key: 'goz',   label: 'Göz',   icon: '👁️' },
  'Kırık Av Zinciri':      { key: 'kulak', label: 'Kulak', icon: '👂' },
  'Parlak Tüy':            { key: 'kanat', label: 'Kanat', icon: '🪽' },
  'Yırtıcı Pençe Parçası': { key: 'pence', label: 'Pençe', icon: '🦅' },
};

const MATERIAL_EMOJI: Record<string, string> = {
  'Kemik Tozu': '🦴',
  'Parlak Tüy': '🪶',
  'Kırık Av Zinciri': '⛓️',
  'Av Gözü Kristali': '💎',
  'Yırtıcı Pençe Parçası': '🦅',
  'Sessizlik Teli': '🎵',
  'Orman Yankısı': '🌲',
  'Gölge Tüyü': '🌑',
};

function materialEmoji(name: string): string {
  return renderItemEmoji(name, MATERIAL_EMOJI[name] ?? '📦');
}

const MATERIAL_DETAIL: Record<string, string> = {
  'Kemik Tozu':
    'Gaga stat upgrade için zorunlu materyal. Her başarılı avda düşme şansı vardır.',
  'Parlak Tüy':
    'Kanat stat upgrade için zorunlu materyal. Orta zorluktaki avlardan düşer.',
  'Kırık Av Zinciri':
    'Kulak stat upgrade için zorunlu materyal.',
  'Av Gözü Kristali':
    'Göz stat upgrade için zorunlu materyal.',
  'Yırtıcı Pençe Parçası':
    'Pençe stat upgrade için zorunlu materyal. Yüksek zorluk avlarında daha sık.',
  'Sessizlik Teli':
    'Upgrade coin maliyetinde opsiyonel indirim (+%3 coin indirimi puanı).',
  'Orman Yankısı':
    'Nadir opsiyonel materyal — upgrade coin indirimi (+%5 puan).',
  'Gölge Tüyü':
    'Nadir opsiyonel materyal — upgrade coin indirimi (+%2 puan).',
};

function normalizeQuery(q: string): string {
  return q
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .trim();
}

function buffEffectLine(def: BuffItemDef): string {
  switch (def.effectType) {
    case 'catch_bonus':
      if (def.id === 'b004') return `Yakalama +${Math.round(def.effectValue * 100)}% · Drop +40%`;
      if (def.id === 'b006') return `Yakalama +${Math.round(def.effectValue * 100)}% · Nadir drop bonusu`;
      return `Yakalama +${Math.round(def.effectValue * 100)}%`;
    case 'loot_mult':
      return `Drop +${Math.round((def.effectValue - 1) * 100)}%`;
    case 'rare_drop_bonus':
      return `Nadir drop +${Math.round(def.effectValue * 100)}%`;
    default:
      return def.description;
  }
}

function buffCompactLine(def: BuffItemDef): string {
  const badge = RARITY_BADGE[def.rarity as keyof typeof RARITY_BADGE] ?? '⬜';
  return (
    `\`${def.useId}\` ${displayBuffEmoji(def)} **${def.name}** ${badge}\n` +
    `↳ ${buffEffectLine(def)} · \`${def.chargeMax}\` charge · av başına −${def.huntCost}`
  );
}

function materialCompactLine(name: string): string {
  const drop = HUNT_ITEM_DROPS.find((d) => d.itemName === name);
  const useId = MATERIAL_USE_IDS[name] ?? '???';
  const emoji = materialEmoji(name);
  const badge = RARITY_BADGE[(drop?.rarity ?? 'Common') as keyof typeof RARITY_BADGE] ?? '⬜';
  const stat = STAT_FOR_MATERIAL[name];
  const bonus = UPGRADE_ITEM_BONUS[name];

  let role: string;
  if (stat) {
    role = `${stat.icon} **${stat.label}** upgrade (zorunlu)`;
  } else if (bonus) {
    role = `Upgrade coin indirimi **+%${bonus}** puan (opsiyonel)`;
  } else {
    role = 'Upgrade materyali';
  }

  const dropHint = drop
    ? `Av drop ~%${drop.dropChance} · min zorluk ${drop.minDifficulty}`
    : 'Av / parçalama';

  return (
    `\`${useId}\` ${emoji} **${name}** ${badge}\n` +
    `↳ ${role} · ${dropHint}`
  );
}

export type CatalogSection = 'all' | 'buff' | 'materyal';

export function resolveCatalogSection(arg: string): CatalogSection | null {
  const q = normalizeQuery(arg);
  if (['buff', 'buffs', 'b'].includes(q)) return 'buff';
  if (['mat', 'materyal', 'material', 'malzeme', 'm'].includes(q)) return 'materyal';
  return null;
}

export function findCatalogEntry(query: string): { kind: 'buff' | 'material'; name: string } | null {
  const q = normalizeQuery(query);
  if (!q) return null;

  const buffById = BUFF_ITEMS.find((b) => b.useId === q.padStart(3, '0') || b.id === q);
  if (buffById) return { kind: 'buff', name: buffById.name };

  for (const [name, id] of Object.entries(MATERIAL_USE_IDS)) {
    if (id === q.padStart(3, '0')) return { kind: 'material', name };
  }

  for (const b of BUFF_ITEMS) {
    if (normalizeQuery(b.name).includes(q) || q.includes(normalizeQuery(b.name))) {
      return { kind: 'buff', name: b.name };
    }
  }

  for (const d of HUNT_ITEM_DROPS) {
    const n = normalizeQuery(d.itemName);
    if (n.includes(q) || q.includes(n)) return { kind: 'material', name: d.itemName };
  }

  return null;
}

/** Discord embed field value limiti (1024) için satır gruplama. */
function chunkFieldLines(lines: string[], maxLen = 1000): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const line of lines) {
    const next = current ? `${current}\n\n${line}` : line;
    if (next.length > maxLen && current) {
      chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : ['—'];
}

function addChunkedFields(
  embed: EmbedBuilder,
  lines: string[],
  title: string,
  continuedTitle: string,
): void {
  const chunks = chunkFieldLines(lines);
  chunks.forEach((value, index) => {
    embed.addFields({
      name: index === 0 ? title : continuedTitle,
      value,
      inline: false,
    });
  });
}

/** Ana katalog embed'inde gösterilecek komut rehberi */
export function buildCatalogCommandsField(helpPrefix: string): string {
  const p = helpPrefix;
  return [
    `\`${p} katalog\` · \`${p} k\` — Tüm av buff'ları + upgrade materyalleri`,
    `\`${p} k defter\` — Av defteri (bulunan / toplam + ipuçları)`,
    `\`${p} k rün\` · \`${p} katalog rün\` — Rün kataloğu`,
    `\`${p} k buff\` · \`${p} katalog buff\` — Sadece av buff listesi (001–006)`,
    `\`${p} k mat\` · \`${p} katalog mat\` — Sadece upgrade materyalleri (021–028)`,
    `\`${p} k keskin\` · \`${p} k 001\` — Tek eşya detayı (isim veya ID)`,
  ].join('\n');
}

export function buildCatalogOverviewEmbed(
  helpPrefix: string,
  section: CatalogSection = 'all',
): EmbedBuilder {
  const buffLines = BUFF_ITEMS.map(buffCompactLine);
  const matLines = HUNT_ITEM_DROPS.map((d) => materialCompactLine(d.itemName));

  const embed = new EmbedBuilder()
    .setColor(COLORS.BUFF)
    .setTitle('📖 Oyun Kataloğu')
    .setDescription(
      section === 'all'
        ? `Oyun içi **buff** ve **upgrade materyalleri** rehberi.\n` +
          `Buff tak: \`${helpPrefix} use 001\` · max **3** aktif`
        : `Buff tak: \`${helpPrefix} use 001\` · max **3** aktif`,
    );

  if (section === 'all') {
    embed.addFields({
      name: '📋 Komutlar',
      value: buildCatalogCommandsField(helpPrefix),
      inline: false,
    });
  }

  if (section === 'all' || section === 'buff') {
    addChunkedFields(
      embed,
      buffLines,
      '✨ Av Buff\'ları (001–006)',
      '✨ Av Buff\'ları (devam)',
    );
  }

  if (section === 'all' || section === 'materyal') {
    addChunkedFields(
      embed,
      matLines,
      '⚒️ Upgrade Materyalleri (021–028)',
      '⚒️ Upgrade Materyalleri (devam)',
    );
  }

  embed.setFooter({
    text: section === 'all'
      ? `Detay için isim veya ID yaz · ${helpPrefix} katalog`
      : `Tam liste: ${helpPrefix} katalog`,
  });

  return embed;
}

export function buildCatalogDetailEmbed(
  entry: { kind: 'buff' | 'material'; name: string },
  helpPrefix: string,
): EmbedBuilder | null {
  if (entry.kind === 'buff') {
    const def = BUFF_ITEMS.find((b) => b.name === entry.name);
    if (!def) return null;

    const badge = RARITY_BADGE[def.rarity as keyof typeof RARITY_BADGE] ?? '⬜';

    return new EmbedBuilder()
      .setColor(COLORS.BUFF)
      .setTitle(`${displayBuffEmoji(def)} ${def.name}`)
      .setDescription(def.description)
      .addFields(
        { name: 'Etki', value: buffEffectLine(def), inline: true },
        { name: 'Nadirlik', value: `${badge} ${def.rarity}`, inline: true },
        { name: 'Charge', value: `\`${def.chargeMax}\` (av başına −${def.huntCost})`, inline: true },
        {
          name: 'Kullanım',
          value: `\`${helpPrefix} use ${def.useId}\` ile tak · envanterden 1 adet düşer`,
          inline: false,
        },
        {
          name: 'Kaynak',
          value: 'Eşya Kutusu (`ek`) · Silah Kutusu (`sk`) · seviye ödülü · av lootbox drop',
          inline: false,
        },
        { name: 'Not', value: def.tradeoff, inline: false },
      )
      .setFooter({ text: `ID: ${def.useId} · ${helpPrefix} katalog` });
  }

  const drop = HUNT_ITEM_DROPS.find((d) => d.itemName === entry.name);
  if (!drop) return null;

  const useId = MATERIAL_USE_IDS[entry.name] ?? '???';
  const emoji = materialEmoji(entry.name);
  const badge = RARITY_BADGE[drop.rarity as keyof typeof RARITY_BADGE] ?? '⬜';
  const stat = STAT_FOR_MATERIAL[entry.name];
  const bonus = UPGRADE_ITEM_BONUS[entry.name];
  const requiredFor = Object.entries(UPGRADE_COST).find(
    ([, costs]) => costs.some((c) => c.itemName === entry.name),
  );

  const usageLines: string[] = [];
  if (stat && requiredFor) {
    usageLines.push(`${stat.icon} **${stat.label}** upgrade'de zorunlu materyal`);
    usageLines.push(`Seviye arttıkça gerekli miktar artar · \`${helpPrefix} upgrade ${stat.key}\``);
  }
  if (bonus) {
    usageLines.push(`Upgrade panelinde opsiyonel — başarı şansına **+${bonus}** puan`);
  }
  if (usageLines.length === 0) {
    usageLines.push(`\`${helpPrefix} upgrade\` sırasında kullanılır`);
  }

  return new EmbedBuilder()
    .setColor(COLORS.UPGRADE)
    .setTitle(`${emoji} ${entry.name}`)
    .setDescription(MATERIAL_DETAIL[entry.name] ?? `${drop.itemType} — upgrade sistemi`)
    .addFields(
      { name: 'Nadirlik', value: `${badge} ${drop.rarity}`, inline: true },
      { name: 'Av drop', value: `~%${drop.dropChance} · min zorluk ${drop.minDifficulty}`, inline: true },
      { name: 'ID', value: `\`${useId}\``, inline: true },
      { name: 'Ne işe yarar', value: usageLines.join('\n'), inline: false },
      {
        name: 'Nereden bulunur',
        value: 'Başarılı av · `dismantle` (parçalama) · market',
        inline: false,
      },
    )
    .setFooter({ text: `${helpPrefix} katalog · ${helpPrefix} inventory` });
}
