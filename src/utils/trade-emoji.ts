/**
 * trade-emoji.ts — Trade UI için özel item çizimleri (embed + select emoji)
 */

import type { ComponentEmojiResolvable } from 'discord.js';
import { resolveGameItemEmoji } from './game-emoji-display';

/**
 * `<:name:id>` / `<a:name:id>` → select/button emoji; unicode fallback string.
 */
export function toComponentEmoji(rendered: string): ComponentEmojiResolvable | undefined {
  const custom = /^<(a?):([a-zA-Z0-9_]+):(\d+)>$/.exec(rendered.trim());
  if (custom) {
    return {
      animated: custom[1] === 'a',
      name: custom[2],
      id: custom[3],
    };
  }
  const unicode = rendered.trim();
  if (unicode.length > 0 && unicode.length <= 8 && !unicode.includes('<')) {
    return unicode;
  }
  return undefined;
}

/**
 * Envanter satırı için Discord özel emoji (yoksa unicode fallback).
 * @invariant Trade select / satır metninde düz yazı yerine bunu kullan.
 */
export function tradeItemEmoji(item: {
  itemName: string;
  itemType?: string;
}): string {
  return resolveGameItemEmoji({
    itemName: item.itemName,
    itemType: item.itemType,
  });
}

export function tradeItemSelectEmoji(item: {
  itemName: string;
  itemType?: string;
}): ComponentEmojiResolvable | undefined {
  return toComponentEmoji(tradeItemEmoji(item));
}

/** Embed satırı: `{emoji} **Name** ×N` */
export function formatTradeItemLine(item: {
  itemName: string;
  itemType?: string;
  quantity: number;
}): string {
  const emoji = tradeItemEmoji(item);
  return `${emoji} **${item.itemName}** ×${item.quantity.toLocaleString('tr-TR')}`;
}
