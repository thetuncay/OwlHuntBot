/**
 * inventory-ux.ts — Hibrit Envanter UI
 *
 * 3 katmanlı yapı:
 *   1. TOP    — Aktif buff'lar + öne çıkan item'lar (her zaman görünür)
 *   2. MIDDLE — Kategori görünümü (Lootbox / Buff / Materyal / Av)
 *   3. BOTTOM — Ham grid (hızlı tarama, sayfalı)
 *
 * Görünüm modları:
 *   'overview'  → Katman 1 + 2 (varsayılan, yeni oyuncu dostu)
 *   'grid'      → Katman 3 (deneyimli oyuncu, hızlı tarama)
 *   'detail'    → Tek item detay paneli
 *
 * Backend logic'e dokunmaz. Sadece UX.
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';

// ─── Tipler ───────────────────────────────────────────────────────────────────

export interface InventoryItem {
  itemName: string;
  itemType: string;
  rarity:   string;
  quantity: number;
}

export interface ActiveBuffData {
  buffItemId:  string;
  buffName:    string;   // emoji dahil
  category:    string;
  chargeCur:   number;
  chargeMax:   number;
}

export type InventoryViewMode = 'overview' | 'grid';

export interface InventoryRenderData {
  username:    string;
  items:       InventoryItem[];
  activeBuffs: ActiveBuffData[];
  usedSlots:   number;
  capacity:    number;
  page:        number;          // grid modunda sayfa
  totalPages:  number;
  mode:        InventoryViewMode;
}

// ─── Sabitler ─────────────────────────────────────────────────────────────────

const COLOR_INV      = 0x5865f2;  // Discord blurple
const COLOR_BUFF     = 0x9b59b6;  // Mor — aktif buff
const COLOR_EMPTY    = 0x95a5a6;  // Gri — boş envanter

// Rarity sıralaması
const RARITY_ORDER: Record<string, number> = {
  Legendary: 5,
  Epic:      4,
  Rare:      3,
  Uncommon:  2,
  Common:    1,
};

// Rarity renk/ikon
const RARITY_BADGE: Record<string, string> = {
  Legendary: '🟡',
  Epic:      '🟣',
  Rare:      '🔵',
  Uncommon:  '🔹',
  Common:    '',
};

// Item tipi → kategori başlığı + emoji
const CATEGORY_META: Record<string, { label: string; emoji: string; order: number }> = {
  'Kutu':     { label: 'Lootbox\'lar',         emoji: '📦', order: 1 },
  'Buff':     { label: 'Buff Item\'ları',       emoji: '✨', order: 2 },
  'Materyal': { label: 'Upgrade Materyalleri',  emoji: '🧱', order: 3 },
  'Av':       { label: 'Av Hayvanları',         emoji: '🍖', order: 4 },
  'Nadir':    { label: 'Nadir Eşyalar',         emoji: '💎', order: 5 },
  'Ekonomi':  { label: 'Ekonomi',               emoji: '💰', order: 6 },
};

// Item emoji haritası
const ITEM_EMOJI: Record<string, string> = {
  // Lootbox'lar
  'Ortak Kutu':          '📦',
  'Nadir Kutu':          '🎁',
  'Efsane Kutu':         '💎',
  // Buff item'ları
  'Keskin Nişan':        '🎯',
  'Av Kokusu':           '🌿',
  'Nadir İz':            '🔮',
  'Orman Ruhu':          '🌲',
  'Yıldız Tüy':          '⭐',
  'Efsane Av Ruhu':      '🦅',
  'Berrak Zihin':        '💡',
  'Koruyucu Talisman':   '🛡️',
  'Usta Eli':            '🔨',
  'Savaş Ruhu':          '⚔️',
  'Savunma Duruşu':      '🛡️',
  'Arena Ustası':        '🏆',
  // Upgrade materyalleri
  'Kemik Tozu':              '🦴',
  'Parlak Tüy':              '🪶',
  'Kırık Av Zinciri':        '⛓️',
  'Av Gözü Kristali':        '💎',
  'Yırtıcı Pençe Parçası':   '🦅',
  'Sessizlik Teli':          '🎵',
  'Orman Yankısı':           '🌲',
  'Gölge Tüyü':              '🌑',
  // Av hayvanları
  'fare':       '🐭',
  'serce':      '🐦',
  'kurbaga':    '🐸',
  'kertenkele': '🦎',
  'hamster':    '🐹',
  'kostebek':   '🐀',
  'yarasa':     '🦇',
  'bildircin':  '🐤',
  'guvercin':   '🕊️',
  'yilan':      '🐍',
  'sincap':     '🐿️',
  'tavsan':     '🐇',
  'gelincik':   '🦡',
  'kirpi':      '🦔',
};

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

function itemEmoji(name: string): string {
  return ITEM_EMOJI[name] ?? '📦';
}

function rarityBadge(rarity: string): string {
  return RARITY_BADGE[rarity] ?? '';
}

function rarityOrder(rarity: string): number {
  return RARITY_ORDER[rarity] ?? 0;
}

function sortByRarityThenQty(items: InventoryItem[]): InventoryItem[] {
  return [...items].sort((a, b) => {
    const rd = rarityOrder(b.rarity) - rarityOrder(a.rarity);
    return rd !== 0 ? rd : b.quantity - a.quantity;
  });
}

/** Slot doluluk barı */
function slotBar(used: number, total: number): string {
  const pct    = Math.min(used / total, 1);
  const filled = Math.round(pct * 8);
  const empty  = 8 - filled;
  const bar    = `${'█'.repeat(filled)}${'░'.repeat(empty)}`;
  const warn   = pct >= 0.9 ? ' ⚠️' : '';
  return `\`[${bar}]\` ${used}/${total}${warn}`;
}

/** Charge barı — OwO tarzı inline gösterim */
function chargeBar(cur: number, max: number): string {
  const pct    = max > 0 ? cur / max : 0;
  const filled = Math.round(pct * 8);
  const empty  = 8 - filled;
  const dot    = pct > 0.5 ? '🟢' : pct > 0.2 ? '🟡' : '🔴';
  return `${dot} \`${cur}/${max}\``;
}

/** Tek item satırı — kategori görünümü için */
function formatCategoryLine(item: InventoryItem): string {
  const emoji  = itemEmoji(item.itemName);
  const badge  = rarityBadge(item.rarity);
  const prefix = badge ? `${badge} ` : '';
  return `${prefix}${emoji} **${item.itemName}** ×${item.quantity}`;
}

/** Tek item satırı — grid görünümü için (kompakt) */
function formatGridLine(item: InventoryItem, idx: number): string {
  const emoji = itemEmoji(item.itemName);
  const badge = rarityBadge(item.rarity);
  const num   = String(idx + 1).padStart(3, '0');
  return `\`[${num}]\` ${badge}${emoji} ×${item.quantity}`;
}

// ─── KATMAN 1: Aktif Buff'lar + Öne Çıkanlar ─────────────────────────────────

function buildTopSection(
  activeBuffs: ActiveBuffData[],
  items: InventoryItem[],
): { buffField: { name: string; value: string; inline: boolean } | null;
     highlightField: { name: string; value: string; inline: boolean } | null } {

  // ── Aktif Buff'lar ──
  let buffField: { name: string; value: string; inline: boolean } | null = null;
  if (activeBuffs.length > 0) {
    const lines = activeBuffs.slice(0, 5).map((b) => {
      const bar = chargeBar(b.chargeCur, b.chargeMax);
      return `${b.buffName} ${bar}`;
    });
    if (activeBuffs.length > 5) lines.push(`*+ ${activeBuffs.length - 5} buff daha...*`);
    buffField = {
      name:   '⚡ Aktif Buff\'lar',
      value:  lines.join('\n'),
      inline: false,
    };
  }

  // ── Öne Çıkanlar (Lootbox + Epic/Legendary item'lar) ──
  const highlights: InventoryItem[] = [];

  // Önce lootbox'lar
  const lootboxes = items.filter((i) => i.itemType === 'Kutu');
  highlights.push(...lootboxes);

  // Sonra Epic/Legendary buff ve nadir item'lar
  const rareItems = items.filter(
    (i) => i.itemType !== 'Kutu' && (i.rarity === 'Epic' || i.rarity === 'Legendary'),
  );
  highlights.push(...rareItems);

  let highlightField: { name: string; value: string; inline: boolean } | null = null;
  if (highlights.length > 0) {
    const sorted = sortByRarityThenQty(highlights).slice(0, 5);
    const lines  = sorted.map((item) => {
      const emoji = itemEmoji(item.itemName);
      const badge = rarityBadge(item.rarity);
      return `${badge}${emoji} **${item.itemName}** ×${item.quantity}`;
    });
    if (highlights.length > 5) lines.push(`*+ ${highlights.length - 5} değerli eşya daha...*`);
    highlightField = {
      name:   '🌟 Öne Çıkanlar',
      value:  lines.join('\n'),
      inline: false,
    };
  }

  return { buffField, highlightField };
}

// ─── KATMAN 2: Kategori Görünümü ─────────────────────────────────────────────

const MAX_PER_CATEGORY = 4;  // Kategori başına max satır (overflow → "X daha")

function buildCategorySection(
  items: InventoryItem[],
): { name: string; value: string; inline: boolean }[] {
  // Kategorilere ayır
  const byCategory = new Map<string, InventoryItem[]>();
  for (const item of items) {
    const key = item.itemType in CATEGORY_META ? item.itemType : 'Diğer';
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(item);
  }

  // Kategori sırasına göre field'ları oluştur
  const orderedKeys = [...byCategory.keys()].sort((a, b) => {
    const oa = CATEGORY_META[a]?.order ?? 99;
    const ob = CATEGORY_META[b]?.order ?? 99;
    return oa - ob;
  });

  const fields: { name: string; value: string; inline: boolean }[] = [];

  for (const key of orderedKeys) {
    const catItems = byCategory.get(key)!;
    const meta     = CATEGORY_META[key] ?? { label: 'Diğer', emoji: '📦', order: 99 };
    const sorted   = sortByRarityThenQty(catItems);
    const visible  = sorted.slice(0, MAX_PER_CATEGORY);
    const hidden   = sorted.length - visible.length;

    let value = visible.map(formatCategoryLine).join('\n');
    if (hidden > 0) value += `\n*+ ${hidden} eşya daha...*`;

    fields.push({
      name:   `${meta.emoji} ${meta.label}`,
      value,
      inline: false,
    });
  }

  return fields;
}

// ─── KATMAN 3: Ham Grid (sayfalı) ────────────────────────────────────────────

const GRID_PER_PAGE = 20;
const GRID_COLS     = 2;   // 2 sütun yan yana

function buildGridSection(
  items: InventoryItem[],
  page: number,
): { fields: { name: string; value: string; inline: boolean }[]; totalPages: number } {
  const sorted     = sortByRarityThenQty(items);
  const totalPages = Math.max(1, Math.ceil(sorted.length / GRID_PER_PAGE));
  const pageItems  = sorted.slice(page * GRID_PER_PAGE, (page + 1) * GRID_PER_PAGE);

  if (pageItems.length === 0) {
    return {
      fields: [{ name: '📚 Tüm Eşyalar', value: '*Envanter boş.*', inline: false }],
      totalPages: 1,
    };
  }

  // 2 sütuna böl
  const half   = Math.ceil(pageItems.length / GRID_COLS);
  const col1   = pageItems.slice(0, half);
  const col2   = pageItems.slice(half);
  const offset = page * GRID_PER_PAGE;

  const col1Lines = col1.map((item, i) => formatGridLine(item, offset + i));
  const col2Lines = col2.map((item, i) => formatGridLine(item, offset + half + i));

  const fields: { name: string; value: string; inline: boolean }[] = [
    {
      name:   `📚 Tüm Eşyalar (${page + 1}/${totalPages})`,
      value:  col1Lines.join('\n') || '\u200b',
      inline: true,
    },
    {
      name:   '\u200b',
      value:  col2Lines.join('\n') || '\u200b',
      inline: true,
    },
  ];

  return { fields, totalPages };
}

// ─── ANA EMBED BUILDER'LAR ────────────────────────────────────────────────────

/**
 * Overview modu: Katman 1 (buff + öne çıkanlar) + Katman 2 (kategoriler)
 * Yeni oyuncu için varsayılan görünüm.
 */
export function buildInventoryOverviewEmbed(data: InventoryRenderData): EmbedBuilder {
  const { username, items, activeBuffs, usedSlots, capacity } = data;

  const hasBuffs = activeBuffs.length > 0;
  const color    = hasBuffs ? COLOR_BUFF : (items.length === 0 ? COLOR_EMPTY : COLOR_INV);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`🎒 ${username}'in Envanteri`);

  if (items.length === 0 && activeBuffs.length === 0) {
    embed.setDescription(
      '> 📭 **Envanter boş.**\n> `hunt` yaparak eşya toplamaya başla!',
    );
    embed.setFooter({ text: slotBar(usedSlots, capacity) });
    return embed;
  }

  embed.setDescription(
    hasBuffs
      ? '> ⚡ Aktif buff\'ların var — avlanmaya hazırsın!'
      : '> Eşyalarını yönet. `📦 Lootbox` açmak için `owl aç` komutunu kullan.',
  );

  // Katman 1
  const { buffField, highlightField } = buildTopSection(activeBuffs, items);
  if (buffField)      embed.addFields(buffField);
  if (highlightField) embed.addFields(highlightField);

  // Ayırıcı (buff veya highlight varsa)
  if (buffField || highlightField) {
    embed.addFields({ name: '\u200b', value: '─────────────────────', inline: false });
  }

  // Katman 2
  const categoryFields = buildCategorySection(items);
  if (categoryFields.length > 0) {
    embed.addFields(...categoryFields);
  }

  embed.setFooter({
    text: `${slotBar(usedSlots, capacity)}  ·  📋 Grid görünümü için ▦ butonuna bas`,
  });

  return embed;
}

/**
 * Grid modu: Katman 3 (ham liste, sayfalı)
 * Deneyimli oyuncu için hızlı tarama.
 */
export function buildInventoryGridEmbed(data: InventoryRenderData): EmbedBuilder {
  const { username, items, usedSlots, capacity, page, totalPages } = data;

  const { fields } = buildGridSection(items, page);

  return new EmbedBuilder()
    .setColor(COLOR_INV)
    .setTitle(`🎒 ${username}'in Envanteri — Grid`)
    .setDescription('> Kompakt görünüm.')
    .addFields(...fields)
    .setFooter({
      text: `${slotBar(usedSlots, capacity)}  ·  Sayfa ${page + 1}/${totalPages}`,
    });
}

/**
 * Tek item detay paneli.
 */
export function buildItemDetailEmbed(item: InventoryItem): EmbedBuilder {
  const emoji = itemEmoji(item.itemName);
  const badge = rarityBadge(item.rarity);

  // Kategori açıklamaları
  const ITEM_DESCRIPTIONS: Record<string, string> = {
    // Lootbox'lar
    'Ortak Kutu':        '📦 Açınca 1–2 buff item çıkar. Common/Rare ağırlıklı.',
    'Nadir Kutu':        '🎁 Açınca 2–3 buff item çıkar. Rare/Epic ağırlıklı.',
    'Efsane Kutu':       '💎 Açınca 2–3 buff item çıkar. Epic/Legendary ağırlıklı.',
    // Buff item'ları
    'Keskin Nişan':      '🎯 Aktifken her avda yakalama şansı +%8. (100 av)',
    'Av Kokusu':         '🌿 Aktifken item drop şansı ×1.35. (80 av)',
    'Nadir İz':          '🔮 Aktifken nadir drop şansı +%12. (60 av)',
    'Orman Ruhu':        '🌲 Aktifken catch +%5 ve drop ×1.20. (120 av)',
    'Yıldız Tüy':        '⭐ Aktifken drop şansı ×1.60. (40 av)',
    'Efsane Av Ruhu':    '🦅 Aktifken catch +%18. (25 av)',
    'Berrak Zihin':      '💡 Aktifken upgrade başarı +8 puan. (100 deneme)',
    'Koruyucu Talisman': '🛡️ Aktifken downgrade şansı ×0.5. (50 deneme)',
    'Usta Eli':          '🔨 Aktifken upgrade başarı +15 puan. (30 deneme)',
    'Savaş Ruhu':        '⚔️ Aktifken PvP hasarı ×1.08. (80 dövüş)',
    'Savunma Duruşu':    '🛡️ Aktifken PvP dodge +%8. (50 dövüş)',
    'Arena Ustası':      '🏆 Aktifken hasar ×1.12 ve dodge +%6. (25 dövüş)',
    // Materyaller
    'Kemik Tozu':              '🦴 Gaga upgrade için gerekli materyal.',
    'Parlak Tüy':              '🪶 Kanat upgrade için gerekli materyal.',
    'Kırık Av Zinciri':        '⛓️ Kulak upgrade için gerekli materyal.',
    'Av Gözü Kristali':        '💎 Göz upgrade için gerekli materyal.',
    'Yırtıcı Pençe Parçası':   '🦅 Pençe upgrade için gerekli materyal.',
    'Sessizlik Teli':          '🎵 Upgrade bonus materyali.',
    'Orman Yankısı':           '🌲 Upgrade bonus materyali (nadir).',
    'Gölge Tüyü':              '🌑 Upgrade bonus materyali (nadir).',
  };

  const description = ITEM_DESCRIPTIONS[item.itemName]
    ?? `${item.itemType} kategorisinde bir eşya.`;

  const usageHint =
    item.itemType === 'Kutu'     ? '`owl aç <kutu>` ile açabilirsin.' :
    item.itemType === 'Buff'     ? '`owl buff <item>` ile aktifleştirebilirsin.' :
    item.itemType === 'Materyal' ? '`owl upgrade` sırasında otomatik kullanılır.' :
    item.itemType === 'Av'       ? '`owl sell` ile satabilirsin.' :
    '';

  return new EmbedBuilder()
    .setColor(
      item.rarity === 'Legendary' ? 0xf1c40f :
      item.rarity === 'Epic'      ? 0x9b59b6 :
      item.rarity === 'Rare'      ? 0x3498db :
      item.rarity === 'Uncommon'  ? 0x2ecc71 :
      0x95a5a6,
    )
    .setTitle(`${badge}${emoji} ${item.itemName}`)
    .setDescription(description)
    .addFields(
      { name: '📊 Miktar',   value: `×${item.quantity}`,  inline: true },
      { name: '⭐ Nadirlik', value: item.rarity,           inline: true },
      { name: '📁 Kategori', value: item.itemType,         inline: true },
    )
    .setFooter({ text: usageHint });
}

// ─── BUTTON ROW'LAR ───────────────────────────────────────────────────────────

/**
 * Overview modu butonları.
 * ▦ → grid moduna geç
 * ◀ / ▶ → sayfa (overview'da genellikle tek sayfa)
 */
export function buildInventoryOverviewRow(
  page: number,
  totalPages: number,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('inv_prev')
      .setLabel('◀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(totalPages <= 1),
    new ButtonBuilder()
      .setCustomId('inv_next')
      .setLabel('▶')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(totalPages <= 1),
    new ButtonBuilder()
      .setCustomId('inv_grid')
      .setLabel('▦ Grid')
      .setStyle(ButtonStyle.Secondary),
  );
}

/**
 * Grid modu butonları.
 * ◀ / ▶ → sayfa
 * 🏠 → overview moduna dön
 */
export function buildInventoryGridRow(
  page: number,
  totalPages: number,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('inv_prev')
      .setLabel('◀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(totalPages <= 1),
    new ButtonBuilder()
      .setCustomId('inv_next')
      .setLabel('▶')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(totalPages <= 1),
    new ButtonBuilder()
      .setCustomId('inv_overview')
      .setLabel('🏠 Genel')
      .setStyle(ButtonStyle.Secondary),
  );
}

// ─── LEGACY COMPAT (mevcut owl.ts çağrısı için) ───────────────────────────────
// owl.ts'deki buildInventoryEmbed çağrısı bu fonksiyona yönlendirilir.
// Yeni runInventory implementasyonu aşağıdaki fonksiyonları kullanır.

export function buildInventoryEmbed(
  username: string,
  items: InventoryItem[],
  usedSlots: number,
  capacity: number,
  page: number,
  totalPages: number,
): EmbedBuilder {
  // Legacy çağrı — overview moduna yönlendir (buff verisi yok)
  return buildInventoryOverviewEmbed({
    username,
    items,
    activeBuffs: [],
    usedSlots,
    capacity,
    page,
    totalPages,
    mode: 'overview',
  });
}
