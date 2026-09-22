/**
 * use-items.ts — Buff kullanım ID sistemi (owl use 001)
 */

import {
  BUFF_ITEMS,
  BUFF_ITEM_USE_MAP,
  BUFF_ITEM_MAP,
  LEGACY_REMOVED_ITEM_SET,
  MAX_ACTIVE_BUFF_TYPES,
  MATERIAL_USE_MAP,
  type BuffItemDef,
} from '../config';
import { chargeBadge } from './theme';
import { displayBuffEmoji } from '../config/custom-emojis';

export function normalizeUseId(raw: string): string {
  const s = raw.trim().toLowerCase();

  if (/^b\d{1,3}$/.test(s)) {
    return s.slice(1).padStart(3, '0');
  }
  if (/^\d+$/.test(s)) {
    return s.padStart(3, '0');
  }
  return s.padStart(3, '0');
}

export function resolveBuffEntry(input: string): BuffItemDef | null {
  const useId = normalizeUseId(input);

  const buff = BUFF_ITEM_USE_MAP[useId];
  if (buff) return buff;

  const lower = input.trim().toLowerCase();
  return BUFF_ITEMS.find((b) => b.name.toLowerCase() === lower) ?? null;
}

/** useId (001–006) → envanter eşya adı. */
export function resolveItemNameFromUseId(input: string): string | null {
  const useId = normalizeUseId(input);
  const buff = BUFF_ITEM_USE_MAP[useId];
  if (buff) return buff.name;

  const material = MATERIAL_USE_MAP[useId];
  if (material) return material;

  return null;
}

export function looksLikeItemUseId(input: string): boolean {
  const s = input.trim();
  return /^\d{1,3}$/.test(s) || /^b\d{1,3}$/i.test(s);
}

export function formatUseId(useId: string): string {
  return useId.padStart(3, '0');
}

export function isLegacyRemovedItem(itemName: string): boolean {
  return LEGACY_REMOVED_ITEM_SET.has(itemName);
}

/** Aktif buff slot özeti */
export function formatBuffSlotStatus(activeCount: number): string {
  return `✨ Aktif buff: **${activeCount}/${MAX_ACTIVE_BUFF_TYPES}**`;
}

export function getUseIdForBuffItemId(buffItemId: string): string | null {
  return BUFF_ITEM_MAP[buffItemId]?.useId ?? null;
}

export function formatActiveBuffLabel(buffItemId: string, chargeCur: number, chargeMax: number): string {
  const def = BUFF_ITEM_MAP[buffItemId];
  if (!def) return `\`${buffItemId}\` ${chargeBadge(chargeCur, chargeMax)}`;
  return `\`${def.useId}\` ${displayBuffEmoji(def)} **${def.name}** ${chargeBadge(chargeCur, chargeMax)}`;
}

export function buildUseIdLegend(helpPrefix: string): string {
  return (
    `Buff tak: \`${helpPrefix} use 001\` · max **${MAX_ACTIVE_BUFF_TYPES}** aktif\n` +
    `Tüm buff ve materyaller: \`${helpPrefix} katalog\``
  );
}
