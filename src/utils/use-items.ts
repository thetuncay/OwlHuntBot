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
  type BuffItemDef,
  type ConsumableItemDef,
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

/** Kullanılabilir tüm ID'lerin kısa özeti (yardım metni). */
export function buildUseIdLegend(helpPrefix: string): string {
  const buffLines = BUFF_ITEMS.map(
    (b) => `\`${b.useId}\` ${b.emoji} ${b.name} *(buff)*`,
  );
  const consLines = CONSUMABLE_ITEMS.map(
    (c) => `\`${c.useId}\` ${c.emoji} ${c.itemName} *(item)*`,
  );
  return [
    '**Buff (001–012):** charge ile aktifleşir',
    buffLines.join(' · '),
    '',
    '**Item (013–015):** kullanınca tüketilir',
    consLines.join(' · '),
    '',
    `> Kullanım: \`${helpPrefix} use 001\``,
  ].join('\n');
}
