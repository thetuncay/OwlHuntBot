/**
 * use-items.ts — Birleşik item/buff kullanım ID sistemi
 *
 * owl use 001  → Buff (001–012)
 * owl use 013  → Consumable (013–015)
 */

import {
  BUFF_ITEMS,
  BUFF_ITEM_USE_MAP,
  BUFF_ITEM_MAP,
  CONSUMABLE_ITEMS,
  CONSUMABLE_USE_MAP,
  CONSUMABLE_ITEM_BY_NAME,
  MAX_ACTIVE_CONSUMABLES,
  MAX_ACTIVE_BUFF_TYPES,
  type BuffItemDef,
  type ConsumableItemDef,
  type ConsumableGearCategory,
} from '../config';

/** Eski b001 / c002 formatını 001 / 015 formatına çevirir. */
const LEGACY_CONSUMABLE_MAP: Record<string, string> = {
  c000: '013',
  c001: '014',
  c002: '015',
};

export type UseEntry =
  | { kind: 'buff'; def: BuffItemDef }
  | { kind: 'consumable'; def: ConsumableItemDef };

export function normalizeUseId(raw: string): string {
  const s = raw.trim().toLowerCase();

  if (/^b\d{1,3}$/.test(s)) {
    return s.slice(1).padStart(3, '0');
  }
  if (/^c\d{3}$/.test(s)) {
    return LEGACY_CONSUMABLE_MAP[s] ?? s.slice(1).padStart(3, '0');
  }
  if (/^\d+$/.test(s)) {
    return s.padStart(3, '0');
  }
  return s.padStart(3, '0');
}

/** useId veya eski ID / isim ile tanım bul. */
export function resolveUseEntry(input: string): UseEntry | null {
  const useId = normalizeUseId(input);

  const buff = BUFF_ITEM_USE_MAP[useId];
  if (buff) return { kind: 'buff', def: buff };

  const consumable = CONSUMABLE_USE_MAP[useId];
  if (consumable) return { kind: 'consumable', def: consumable };

  const lower = input.trim().toLowerCase();
  const buffByName = BUFF_ITEMS.find((b) => b.name.toLowerCase() === lower);
  if (buffByName) return { kind: 'buff', def: buffByName };

  const consumableByName = CONSUMABLE_ITEMS.find((c) => c.itemName.toLowerCase() === lower);
  if (consumableByName) return { kind: 'consumable', def: consumableByName };

  return null;
}

export function formatUseId(useId: string): string {
  return useId.padStart(3, '0');
}

/** Yük slotu kullanan craft item mi? (anlık yemler hariç) */
export function usesEquipSlot(def: ConsumableItemDef): boolean {
  return def.durationMs > 0;
}

const GEAR_LABEL: Record<ConsumableGearCategory, string> = {
  yem:   '🌾 Yem',
  iksir: '🧪 İksir',
  'zırh': '🛡️ Zırh',
  alet:  '🪨 Alet',
};

export function formatGearCategory(def: ConsumableItemDef): string {
  return GEAR_LABEL[def.gearCategory] ?? '📦 Item';
}

/** use listesi / hata mesajları için yük slot özeti */
export function formatEquipSlotStatus(activeCount: number): string {
  return `📦 Yük slotu: **${activeCount}/${MAX_ACTIVE_CONSUMABLES}** *(buff 001–012 ayrı, max ${MAX_ACTIVE_BUFF_TYPES} aynı tür)*`;
}

/** use embed alanı — tüm effect tipleri */
export function formatConsumableEffectField(def: ConsumableItemDef): { name: string; value: string } {
  const mins = def.durationMs > 0 ? Math.round(def.durationMs / 60000) : 0;
  const slotNote = usesEquipSlot(def) ? ` · yük slotu (${mins} dk)` : '';

  switch (def.effectType) {
    case 'stamina_restore_once':
      return { name: '⚡ Etki', value: `Sonraki av sonunda stamina **+${def.effectValue}**${slotNote}` };
    case 'stamina_boost_once':
      return { name: '⚡ Etki', value: `Sonraki av sonunda stamina **+${def.effectValue}**${slotNote}` };
    case 'upgrade_bonus_once':
      return { name: '⚡ Etki', value: `Upgrade başarı **+${def.effectValue} puan**${slotNote}` };
    case 'hunt_catch_once':
      return { name: '⚡ Etki', value: `Sonraki hunt yakalama **+${Math.round(def.effectValue * 100)}%**${slotNote}` };
    case 'hunt_loot_once':
      return { name: '⚡ Etki', value: `Sonraki hunt drop **+${Math.round(def.effectValue * 100)}%**${slotNote}` };
    case 'pvp_damage_once':
      return { name: '⚡ Etki', value: `Sonraki PvP hasar **+${Math.round(def.effectValue * 100)}%**${slotNote}` };
    case 'pvp_dodge_equip':
      return { name: '⚡ Etki', value: `PvP dodge **+${Math.round(def.effectValue * 100)}%**${slotNote}` };
    case 'downgrade_shield_once':
      return { name: '⚡ Etki', value: `Downgrade riski **×${def.effectValue}** (yarıya iner)${slotNote}` };
    default:
      return { name: '⚡ Etki', value: def.description };
  }
}
export async function getConsumableEffectValue(
  redis: { get: (key: string) => Promise<string | null> },
  playerId: string,
  effectType: ConsumableItemDef['effectType'],
): Promise<number> {
  const def = CONSUMABLE_ITEMS.find((c) => c.effectType === effectType && c.durationMs > 0);
  if (!def) return 0;
  const val = await redis.get(`${def.redisKey}:${playerId}`);
  if (!val) return 0;
  const parsed = parseFloat(val);
  return Number.isFinite(parsed) ? parsed : def.effectValue;
}

/** Birden fazla consumable effect'i tek batch ile oku. */
export async function getConsumableEffectValues(
  redis: {
    get: (key: string) => Promise<string | null>;
    pipeline?: () => { get: (key: string) => unknown; exec: () => Promise<Array<[Error | null, unknown]> | null> };
  },
  playerId: string,
  effectTypes: ConsumableItemDef['effectType'][],
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const defs = effectTypes
    .map((effectType) => ({
      effectType,
      def: CONSUMABLE_ITEMS.find((c) => c.effectType === effectType && c.durationMs > 0),
    }))
    .filter((row): row is { effectType: ConsumableItemDef['effectType']; def: ConsumableItemDef } => Boolean(row.def));

  if (defs.length === 0) return out;

  if (redis.pipeline) {
    const p = redis.pipeline();
    for (const { def } of defs) {
      p.get(`${def.redisKey}:${playerId}`);
    }
    const rows = await p.exec();
    const safeRows = rows ?? [];
    for (let i = 0; i < defs.length; i++) {
      const pair = safeRows[i];
      const effectType = defs[i]!.effectType;
      const rawVal = pair?.[1];
      const val = typeof rawVal === 'string' ? rawVal : null;
      if (!val) {
        out[effectType] = 0;
        continue;
      }
      const parsed = parseFloat(val);
      out[effectType] = Number.isFinite(parsed) ? parsed : defs[i]!.def.effectValue;
    }
    return out;
  }

  const vals = await Promise.all(defs.map(({ def }) => redis.get(`${def.redisKey}:${playerId}`)));
  for (let i = 0; i < defs.length; i++) {
    const effectType = defs[i]!.effectType;
    const val = vals[i];
    if (!val) {
      out[effectType] = 0;
      continue;
    }
    const parsed = parseFloat(val);
    out[effectType] = Number.isFinite(parsed) ? parsed : defs[i]!.def.effectValue;
  }
  return out;
}

/** Tek kullanımlık consumable efektini tüket (Redis key sil). */
export async function consumeConsumableEffect(
  redis: { del: (...keys: string[]) => Promise<number> },
  playerId: string,
  effectType: ConsumableItemDef['effectType'],
): Promise<boolean> {
  const def = CONSUMABLE_ITEMS.find((c) => c.effectType === effectType && c.durationMs > 0);
  if (!def) return false;
  const deleted = await redis.del(`${def.redisKey}:${playerId}`);
  return deleted > 0;
}

/** Birden fazla consumable effect key'ini tek seferde tüket. */
export async function consumeConsumableEffects(
  redis: { del: (...keys: string[]) => Promise<number> },
  playerId: string,
  effectTypes: ConsumableItemDef['effectType'][],
): Promise<number> {
  const keys = effectTypes
    .map((effectType) => CONSUMABLE_ITEMS.find((c) => c.effectType === effectType && c.durationMs > 0))
    .filter((def): def is ConsumableItemDef => Boolean(def))
    .map((def) => `${def.redisKey}:${playerId}`);
  if (keys.length === 0) return 0;
  return redis.del(...keys);
}

/** Aktif süreli consumable efektleri (Redis). */
export async function getActiveConsumables(
  redis: { get: (key: string) => Promise<string | null>; pttl: (key: string) => Promise<number> },
  playerId: string,
): Promise<{ def: ConsumableItemDef; expiresAt: number }[]> {
  const results: { def: ConsumableItemDef; expiresAt: number }[] = [];
  for (const def of CONSUMABLE_ITEMS) {
    if (def.durationMs === 0) continue;
    const key = `${def.redisKey}:${playerId}`;
    const val = await redis.get(key);
    if (val) {
      const ttl = await redis.pttl(key);
      results.push({ def, expiresAt: Date.now() + ttl });
    }
  }
  return results;
}

/** Envanter satırı için görünen use ID. */
export function getUseIdForInventoryItem(item: { itemName: string; itemType: string }): string | null {
  if (item.itemType === 'Buff') {
    const def = BUFF_ITEMS.find((b) => b.name === item.itemName);
    return def?.useId ?? null;
  }
  if (item.itemType === 'Consumable') {
    const def = CONSUMABLE_ITEM_BY_NAME[item.itemName];
    return def?.useId ?? null;
  }
  return null;
}

export function getUseIdForBuffItemId(buffItemId: string): string | null {
  return BUFF_ITEM_MAP[buffItemId]?.useId ?? null;
}

/** Aktif buff satırı için görünen isim. */
export function formatActiveBuffLabel(buffItemId: string, chargeCur: number, chargeMax: number): string {
  const def = BUFF_ITEM_MAP[buffItemId];
  if (!def) return `\`${buffItemId}\` ${chargeCur}/${chargeMax}`;
  return `\`${def.useId}\` ${def.emoji} **${def.name}** \`${chargeCur}/${chargeMax}\``;
}

/** Craft menüsü / tarif satırı — consumable tanımından üretilir */
export function formatCraftRecipeBlurb(itemName: string, fallback = ''): string {
  const def = CONSUMABLE_ITEM_BY_NAME[itemName];
  if (!def) return fallback;
  const mins = Math.round(def.durationMs / 60000);
  return `\`${def.useId}\` ${formatGearCategory(def)} · **${mins} dk yük slotu** · ${def.description}`;
}

export function formatCraftUseHint(itemName: string, prefix: string): string {
  const def = CONSUMABLE_ITEM_BY_NAME[itemName];
  if (!def) return '';
  return `  📌 Takmak için: \`${prefix} use ${def.useId}\``;
}

/** Kullanılabilir tüm ID'lerin kısa özeti (yardım metni). */
export function buildUseIdLegend(helpPrefix: string): string {
  const buffLines = BUFF_ITEMS.map((b) => `\`${b.useId}\` ${b.emoji} ${b.name}`).join(' · ');
  const byGear = new Map<ConsumableGearCategory, ConsumableItemDef[]>();
  for (const c of CONSUMABLE_ITEMS) {
    if (!byGear.has(c.gearCategory)) byGear.set(c.gearCategory, []);
    byGear.get(c.gearCategory)!.push(c);
  }
  const gearLines = ([ 'yem', 'iksir', 'zırh', 'alet' ] as ConsumableGearCategory[])
    .filter((g) => byGear.has(g))
    .map((g) => {
      const items = byGear.get(g)!.map((c) => `\`${c.useId}\` ${c.emoji} ${c.itemName}`).join(' · ');
      return `${GEAR_LABEL[g]}: ${items}`;
    });

  return [
    `**Buff (001–012):** lootbox · charge · max ${MAX_ACTIVE_BUFF_TYPES} aynı tür`,
    buffLines,
    '',
    `**Craft yük (013–020):** \`${helpPrefix} craft\` · min **15 dk** aktif · max **${MAX_ACTIVE_CONSUMABLES}** slot`,
    ...gearLines,
    '',
    `> Kullanım: \`${helpPrefix} use 001\` (buff) · \`${helpPrefix} use 014\` (craft item)`,
  ].join('\n');
}
