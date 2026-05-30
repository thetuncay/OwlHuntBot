/**
 * craft-ux.ts — OwO tarzı crafting menüsü (monospace text + renk/emoji)
 */

import {
  CRAFTING_RECIPES,
  CONSUMABLE_ITEM_BY_NAME,
  CONSUMABLE_USE_MAP,
  type ConsumableItemDef,
  type CraftingRecipe,
} from '../config';
import { RARITY_BADGE } from './theme';

export type CraftStatusKind = 'ready' | 'coin' | 'material';

export interface CraftRowState {
  recipe: CraftingRecipe;
  useId: string;
  status: CraftStatusKind;
  subline: string;
  sortOrder: number;
}

const CRAFT_DISPLAY_NAME: Record<string, string> = {
  c000: 'Besleyici Karma Yem',
  c001: 'Gaga Bileme Taşı',
  c002: 'Yırtıcı İksiri',
  c003: 'Savaş İksiri',
  c004: 'Gölge Zırhı',
  c005: 'Av Trofesi Yağı',
  c006: 'Koruyucu Balmumu',
  c007: 'Güç Kapsülü',
};

const GEAR_TYPE_LABEL: Record<string, string> = {
  yem:   '🌾 Yem',
  iksir: '🧪 İksir',
  'zırh': '🛡️ Zırh',
  alet:  '🪨 Alet',
};

const PREY_DISPLAY: Record<string, string> = {
  fare:       'Fare',
  serce:      'Serçe',
  bildircin:  'Bıldırcın',
  hamster:    'Hamster',
  kostebek:   'Kostebek',
};

const MATERIAL_EMOJI: Record<string, string> = {
  fare:                  '🐭',
  serce:                 '🐦',
  bildircin:             '🦃',
  hamster:               '🐹',
  kostebek:              '🕳️',
  'Kemik Tozu':          '🦴',
  'Parlak Tüy':          '✨',
  'Yırtıcı Pençe Parçası': '🐾',
  'Gölge Tüyü':          '🪶',
  'Sessizlik Teli':      '🔗',
  'Av Gözü Kristali':    '👁️',
  'Orman Yankısı':       '🌲',
  'Kırık Av Zinciri':    '⛓️',
};

const STATUS_ICON: Record<CraftStatusKind, string> = {
  ready:    '🟢',
  coin:     '🟡',
  material: '🔴',
};

const STATUS_SORT: Record<CraftStatusKind, number> = {
  ready:    0,
  coin:     1,
  material: 2,
};

const SECTION_HEADER: Record<CraftStatusKind, string> = {
  ready:    '✨ Üretilebilir',
  coin:     '💰 Coin Eksik',
  material: '📦 Malzeme Eksik',
};

export function formatCraftCoins(n: number): string {
  return n.toLocaleString('tr-TR');
}

function displayMaterial(name: string): string {
  return PREY_DISPLAY[name] ?? name;
}

function materialEmoji(name: string): string {
  return MATERIAL_EMOJI[name] ?? '📦';
}

function getConsumableDef(recipe: CraftingRecipe): ConsumableItemDef | undefined {
  return CONSUMABLE_ITEM_BY_NAME[recipe.resultItem.itemName];
}

function effectEmoji(def: ConsumableItemDef): string {
  switch (def.effectType) {
    case 'stamina_restore_once':
    case 'stamina_boost_once':
      return '⚡';
    case 'upgrade_bonus_once':
      return '⬆️';
    case 'hunt_catch_once':
      return '🎯';
    case 'pvp_damage_once':
      return '⚔️';
    case 'pvp_dodge_equip':
      return '💨';
    case 'hunt_loot_once':
      return '💎';
    case 'downgrade_shield_once':
      return '🛡️';
    default:
      return '✨';
  }
}

function rarityBadge(recipe: CraftingRecipe): string {
  const badge = RARITY_BADGE[recipe.resultItem.rarity] ?? '';
  return badge ? `${badge} ` : '';
}

/** Kısa bonus satırı (ana liste) */
export function formatCraftShortEffect(def: ConsumableItemDef): string {
  const icon = effectEmoji(def);
  switch (def.effectType) {
    case 'stamina_restore_once':
      return `${icon} +${def.effectValue} Stamina`;
    case 'stamina_boost_once':
      return `${icon} +${def.effectValue} Stamina`;
    case 'upgrade_bonus_once':
      return `${icon} +${def.effectValue} Upgrade`;
    case 'hunt_catch_once':
      return `${icon} +${Math.round(def.effectValue * 100)}% Catch`;
    case 'pvp_damage_once':
      return `${icon} +${Math.round(def.effectValue * 100)}% PvP Damage`;
    case 'pvp_dodge_equip':
      return `${icon} +${Math.round(def.effectValue * 100)}% Dodge`;
    case 'hunt_loot_once':
      return `${icon} +${Math.round(def.effectValue * 100)}% Drop`;
    case 'downgrade_shield_once':
      return `${icon} %${Math.round((1 - def.effectValue) * 100)} Daha Az Risk`;
    default:
      return `${icon} ${def.description}`;
  }
}

export function getCraftDisplayName(recipe: CraftingRecipe): string {
  return CRAFT_DISPLAY_NAME[recipe.id] ?? recipe.name;
}

export function evaluateCraftRow(
  recipe: CraftingRecipe,
  invMap: Map<string, number>,
  playerCoins: number,
): CraftRowState {
  const def = getConsumableDef(recipe);
  const useId = def?.useId ?? '???';
  const effectLine = def ? formatCraftShortEffect(def) : `✨ ${recipe.description}`;

  const missingMat = recipe.requiredMaterials.find(
    (m) => (invMap.get(m.itemName) ?? 0) < m.quantity,
  );

  if (missingMat) {
    const matName = displayMaterial(missingMat.itemName);
    return {
      recipe,
      useId,
      status: 'material',
      subline: `${materialEmoji(missingMat.itemName)} ${matName} Eksik`,
      sortOrder: STATUS_SORT.material,
    };
  }

  if (playerCoins < recipe.requiredCoins) {
    const deficit = recipe.requiredCoins - playerCoins;
    return {
      recipe,
      useId,
      status: 'coin',
      subline: `💰 ${formatCraftCoins(deficit)} Coin Eksik`,
      sortOrder: STATUS_SORT.coin,
    };
  }

  return {
    recipe,
    useId,
    status: 'ready',
    subline: effectLine,
    sortOrder: STATUS_SORT.ready,
  };
}

function boxTitle(title: string): string[] {
  const inner = `   ${title}`;
  const w = Math.max(16, inner.length + 2);
  return [
    `╭${'─'.repeat(w)}╮`,
    inner,
    `╰${'─'.repeat(w)}╯`,
  ];
}

function sectionDivider(kind: CraftStatusKind): string {
  const label = SECTION_HEADER[kind];
  const pad = Math.max(4, 22 - label.length);
  return `${label} ${'─'.repeat(pad)}`;
}

function formatCraftRow(row: CraftRowState): string {
  const icon = STATUS_ICON[row.status];
  const name = getCraftDisplayName(row.recipe);
  const itemEmoji = row.recipe.emoji;
  const badge = rarityBadge(row.recipe);
  return `${icon} ${itemEmoji} ${row.useId} ${badge}${name}\n   ${row.subline}`;
}

function buildSummaryLine(rows: CraftRowState[], playerCoins: number): string {
  const ready = rows.filter((r) => r.status === 'ready').length;
  const coin = rows.filter((r) => r.status === 'coin').length;
  const mat = rows.filter((r) => r.status === 'material').length;
  return `💰 **${formatCraftCoins(playerCoins)}** coin  ·  ✨ ${ready} hazır  ·  🟡 ${coin} coin  ·  🔴 ${mat} malzeme`;
}

/** Ana crafting menüsü — düz text */
export function buildCraftMenuText(
  invMap: Map<string, number>,
  playerCoins: number,
  prefix: string,
): string {
  const rows = CRAFTING_RECIPES
    .map((r) => evaluateCraftRow(r, invMap, playerCoins))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.useId.localeCompare(b.useId));

  const lines: string[] = [
    ...boxTitle('🔨 Crafting Atölyesi'),
    '',
    buildSummaryLine(rows, playerCoins),
    '',
  ];

  let lastSort = -1;
  for (const row of rows) {
    if (row.sortOrder !== lastSort) {
      if (lastSort >= 0) lines.push('');
      lines.push(sectionDivider(row.status), '');
      lastSort = row.sortOrder;
    }
    lines.push(formatCraftRow(row), '');
  }

  lines.push(
    '━━━━━━━━━━━━━━━━━━',
    '',
    '📋 Durum Rehberi',
    '🟢 Üretilebilir',
    '🟡 Malzeme tam · coin eksik',
    '🔴 En az bir malzeme eksik',
    '',
    '━━━━━━━━━━━━━━━━━━',
    '',
    `📖 Detay → \`${prefix} craftinfo <id>\``,
    `⚒️ Üret → \`${prefix} craft <id>\``,
  );

  return lines.join('\n');
}

function dotPad(label: string, emoji: string, have: number, need: number, ok: boolean): string {
  const left = `${ok ? '✅' : '❌'} ${emoji} ${label}`;
  const right = `${formatCraftCoins(have)} / ${formatCraftCoins(need)}`;
  const dots = Math.max(1, 16 - label.length);
  return `${left} ${'.'.repeat(dots)} ${right}`;
}

function formatDuration(mins: number): string {
  return `⏱️ ${mins} Dakika`;
}

function formatDetailEffect(def: ConsumableItemDef): string[] {
  const icon = effectEmoji(def);
  switch (def.effectType) {
    case 'stamina_restore_once':
    case 'stamina_boost_once':
      return [`${icon} Av sonunda`, `   stamina **+${def.effectValue}**`];
    case 'upgrade_bonus_once':
      return [`${icon} Sonraki upgrade'de`, `   başarı şansı **+${def.effectValue} puan**`];
    case 'hunt_catch_once':
      return [`${icon} Sonraki avda`, `   yakalama **+${Math.round(def.effectValue * 100)}%**`];
    case 'pvp_damage_once':
      return [`${icon} Sonraki PvP'de`, `   hasar **+${Math.round(def.effectValue * 100)}%**`];
    case 'pvp_dodge_equip':
      return [`${icon} ${Math.round(def.durationMs / 60000)} dk boyunca`, `   dodge **+${Math.round(def.effectValue * 100)}%**`];
    case 'hunt_loot_once':
      return [`${icon} Sonraki avda`, `   drop **+${Math.round(def.effectValue * 100)}%**`];
    case 'downgrade_shield_once':
      return [`${icon} Sonraki upgrade'de`, '   downgrade riski **yarıya iner**'];
    default:
      return [`${icon} ${def.description}`];
  }
}

function formatStatusLine(row: CraftRowState): string {
  switch (row.status) {
    case 'ready':
      return '✨ 🟢 Üretilebilir — hemen craft edebilirsin!';
    case 'coin':
      return `💸 🟡 ${row.subline}`;
    case 'material':
      return `📦 🔴 ${row.subline}`;
  }
}

/** craftinfo detay ekranı */
export function buildCraftInfoText(
  recipe: CraftingRecipe,
  invMap: Map<string, number>,
  playerCoins: number,
  prefix: string,
): string {
  const def = getConsumableDef(recipe);
  const row = evaluateCraftRow(recipe, invMap, playerCoins);
  const displayName = getCraftDisplayName(recipe);
  const emoji = recipe.emoji;
  const badge = rarityBadge(recipe);
  const mins = def ? Math.round(def.durationMs / 60000) : 0;

  const lines: string[] = [
    ...boxTitle(`${emoji} ${displayName}`),
    '',
  ];

  if (def) {
    lines.push(
      `🆔 ID · **${def.useId}**`,
      `🏷️ Tür · ${GEAR_TYPE_LABEL[def.gearCategory] ?? def.gearCategory}`,
      `⏱️ Süre · **${mins} Dakika**`,
      `${badge || '⬜'} Nadir · **${recipe.resultItem.rarity}**`,
      '',
      '━━━━━━━━━━━━━━━━━━',
      '',
      '📈 Etki',
      '',
      ...formatDetailEffect(def),
      '',
      '━━━━━━━━━━━━━━━━━━',
      '',
      '📦 Gerekenler',
      '',
    );
  } else {
    lines.push('━━━━━━━━━━━━━━━━━━', '', '📦 Gerekenler', '');
  }

  for (const mat of recipe.requiredMaterials) {
    const have = invMap.get(mat.itemName) ?? 0;
    const label = displayMaterial(mat.itemName);
    lines.push(dotPad(label, materialEmoji(mat.itemName), have, mat.quantity, have >= mat.quantity));
  }

  lines.push(
    dotPad('Coin', '💰', playerCoins, recipe.requiredCoins, playerCoins >= recipe.requiredCoins),
    '',
    '━━━━━━━━━━━━━━━━━━',
    '',
    '🎯 Durum',
    formatStatusLine(row),
    '',
    '━━━━━━━━━━━━━━━━━━',
    '',
    '⚒️ Üret',
    `\`${prefix} craft ${row.useId}\``,
  );

  return lines.join('\n');
}

/** craft / craftinfo hedef çözümü — useId (013), tarif no (1–8) veya c000 */
export function resolveCraftTarget(input: string): CraftingRecipe | null {
  const raw = input.trim().toLowerCase();
  if (!raw) return null;

  if (/^c\d{3}$/.test(raw)) {
    return CRAFTING_RECIPES.find((r) => r.id === raw) ?? null;
  }

  const useId = raw.padStart(3, '0');
  const byUse = CONSUMABLE_USE_MAP[useId];
  if (byUse) {
    return CRAFTING_RECIPES.find((r) => r.resultItem.itemName === byUse.itemName) ?? null;
  }

  const num = parseInt(raw, 10);
  if (!Number.isNaN(num) && num >= 1 && num <= CRAFTING_RECIPES.length) {
    return CRAFTING_RECIPES[num - 1] ?? null;
  }

  return CRAFTING_RECIPES.find(
    (r) => r.name.toLowerCase() === raw || getCraftDisplayName(r).toLowerCase() === raw,
  ) ?? null;
}
