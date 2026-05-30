/**
 * craft-ux.ts — OwO tarzı sade crafting menüsü (monospace text)
 */

import {
  CRAFTING_RECIPES,
  CONSUMABLE_ITEM_BY_NAME,
  CONSUMABLE_USE_MAP,
  type ConsumableItemDef,
  type CraftingRecipe,
} from '../config';

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
  yem:   'Yem',
  iksir: 'İksir',
  'zırh': 'Zırh',
  alet:  'Alet',
};

const PREY_DISPLAY: Record<string, string> = {
  fare:       'Fare',
  serce:      'Serçe',
  bildircin:  'Bıldırcın',
  hamster:    'Hamster',
  kostebek:   'Kostebek',
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

export function formatCraftCoins(n: number): string {
  return n.toLocaleString('tr-TR');
}

function displayMaterial(name: string): string {
  return PREY_DISPLAY[name] ?? name;
}

function getConsumableDef(recipe: CraftingRecipe): ConsumableItemDef | undefined {
  return CONSUMABLE_ITEM_BY_NAME[recipe.resultItem.itemName];
}

/** Kısa bonus satırı (ana liste) */
export function formatCraftShortEffect(def: ConsumableItemDef): string {
  switch (def.effectType) {
    case 'stamina_restore_once':
      return `+${def.effectValue} Stamina`;
    case 'stamina_boost_once':
      return `+${def.effectValue} Stamina`;
    case 'upgrade_bonus_once':
      return `+${def.effectValue} Upgrade`;
    case 'hunt_catch_once':
      return `+${Math.round(def.effectValue * 100)}% Catch`;
    case 'pvp_damage_once':
      return `+${Math.round(def.effectValue * 100)}% PvP Damage`;
    case 'pvp_dodge_equip':
      return `+${Math.round(def.effectValue * 100)}% Dodge`;
    case 'hunt_loot_once':
      return `+${Math.round(def.effectValue * 100)}% Drop`;
    case 'downgrade_shield_once':
      return `%${Math.round((1 - def.effectValue) * 100)} Daha Az Risk`;
    default:
      return recipeFallbackEffect(def);
  }
}

function recipeFallbackEffect(def: ConsumableItemDef): string {
  return def.description;
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
  const effectLine = def ? formatCraftShortEffect(def) : recipe.description;

  const missingMat = recipe.requiredMaterials.find(
    (m) => (invMap.get(m.itemName) ?? 0) < m.quantity,
  );

  if (missingMat) {
    return {
      recipe,
      useId,
      status: 'material',
      subline: `${displayMaterial(missingMat.itemName)} Eksik`,
      sortOrder: STATUS_SORT.material,
    };
  }

  if (playerCoins < recipe.requiredCoins) {
    const deficit = recipe.requiredCoins - playerCoins;
    return {
      recipe,
      useId,
      status: 'coin',
      subline: `${formatCraftCoins(deficit)} Coin Eksik`,
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
  const w = Math.max(14, inner.length + 2);
  return [
    `╭${'─'.repeat(w)}╮`,
    inner,
    `╰${'─'.repeat(w)}╯`,
  ];
}

function formatCraftRow(row: CraftRowState): string {
  const icon = STATUS_ICON[row.status];
  const name = getCraftDisplayName(row.recipe);
  return `${icon} ${row.useId} ${name}\n   ${row.subline}`;
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
    ...boxTitle('🔨 Crafting'),
    '',
  ];

  let lastSort = -1;
  for (const row of rows) {
    if (lastSort >= 0 && row.sortOrder !== lastSort) {
      lines.push('━━━━━━━━━━━━━━━━━━', '');
    }
    lines.push(formatCraftRow(row), '');
    lastSort = row.sortOrder;
  }

  lines.push(
    '━━━━━━━━━━━━━━━━━━',
    '',
    '🟢 Üretilebilir',
    '🟡 Yeterli malzeme var, coin eksik',
    '🔴 En az bir gerekli malzeme eksik',
    '',
    '━━━━━━━━━━━━━━━━━━',
    '',
    `📖 Detay → \`${prefix} craftinfo <id>\``,
    `⚒️ Üret → \`${prefix} craft <id>\``,
  );

  return lines.join('\n');
}

function dotPad(label: string, have: number, need: number, ok: boolean): string {
  const left = `${ok ? '✅' : '❌'} ${label}`;
  const right = `${formatCraftCoins(have)} / ${formatCraftCoins(need)}`;
  const dots = Math.max(1, 18 - label.length);
  return `${left} ${'.'.repeat(dots)} ${right}`;
}

function formatDuration(mins: number): string {
  return `${mins} Dakika`;
}

function formatDetailEffect(def: ConsumableItemDef): string[] {
  switch (def.effectType) {
    case 'stamina_restore_once':
    case 'stamina_boost_once':
      return ['Av sonunda', `stamina +${def.effectValue}`];
    case 'upgrade_bonus_once':
      return ['Sonraki upgrade\'de', `başarı şansı +${def.effectValue} puan`];
    case 'hunt_catch_once':
      return ['Sonraki avda', `yakalama şansı +${Math.round(def.effectValue * 100)}%`];
    case 'pvp_damage_once':
      return ['Sonraki PvP\'de', `hasar +${Math.round(def.effectValue * 100)}%`];
    case 'pvp_dodge_equip':
      return [`${Math.round(def.durationMs / 60000)} dk boyunca`, `dodge +${Math.round(def.effectValue * 100)}%`];
    case 'hunt_loot_once':
      return ['Sonraki avda', `drop şansı +${Math.round(def.effectValue * 100)}%`];
    case 'downgrade_shield_once':
      return ['Sonraki upgrade\'de', 'downgrade riski yarıya iner'];
    default:
      return [def.description];
  }
}

function formatStatusLine(row: CraftRowState): string {
  switch (row.status) {
    case 'ready':
      return '🟢 Üretilebilir';
    case 'coin':
      return `🟡 ${row.subline}`;
    case 'material':
      return `🔴 ${row.subline}`;
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
  const mins = def ? Math.round(def.durationMs / 60000) : 0;

  const lines: string[] = [
    ...boxTitle(`${emoji} ${displayName}`),
    '',
  ];

  if (def) {
    lines.push(
      `ID: ${def.useId}`,
      `Tür: ${GEAR_TYPE_LABEL[def.gearCategory] ?? def.gearCategory}`,
      `Süre: ${formatDuration(mins)}`,
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
    lines.push(dotPad(displayMaterial(mat.itemName), have, mat.quantity, have >= mat.quantity));
  }

  lines.push(
    dotPad('Coin', playerCoins, recipe.requiredCoins, playerCoins >= recipe.requiredCoins),
    '',
    '━━━━━━━━━━━━━━━━━━',
    '',
    'Durum:',
    formatStatusLine(row),
    '',
    '━━━━━━━━━━━━━━━━━━',
    '',
    '⚒️ Üret:',
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
