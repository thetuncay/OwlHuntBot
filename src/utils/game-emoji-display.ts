import { BUFF_ITEM_MAP, LOOTBOX_DEFS, LOOTBOX_DEF_MAP } from '../config';
import { RUNE_DEF_BY_NAME, RUNE_ITEM_TYPE } from '../config/runes';
import {
  displayBuffEmoji,
  displayLootboxEmoji,
  renderBuffEmoji,
  renderEmoji,
  renderItemEmoji,
  renderLootboxEmoji,
  renderPreyEmoji,
} from '../config/custom-emojis';

export function lootboxEmojiById(lootboxId: string, fallback = '📦'): string {
  const def = LOOTBOX_DEF_MAP[lootboxId];
  return def ? displayLootboxEmoji(def) : renderLootboxEmoji(lootboxId, fallback);
}

export function lootboxEmojiByName(name: string, fallback = '📦'): string {
  const def = LOOTBOX_DEFS.find((d) => d.name === name);
  return def ? displayLootboxEmoji(def) : renderItemEmoji(name, fallback);
}

export function buffEmojiById(buffItemId: string, fallback = '✨'): string {
  const def = BUFF_ITEM_MAP[buffItemId];
  return def ? displayBuffEmoji(def) : renderBuffEmoji(buffItemId, fallback);
}

export function resolveGameItemEmoji(item: {
  itemName: string;
  itemType?: string;
  emoji?: string;
}): string {
  switch (item.itemType) {
    case 'Av':
      return renderPreyEmoji(item.itemName);
    case 'Kutu':
      return lootboxEmojiByName(item.itemName, item.emoji ?? '📦');
    case 'Buff':
      return renderBuffEmoji(item.itemName, item.emoji ?? '✨');
    case 'Materyal':
      return renderItemEmoji(item.itemName, item.emoji ?? '🔩');
    case RUNE_ITEM_TYPE: {
      const def = RUNE_DEF_BY_NAME.get(item.itemName.toLocaleLowerCase('tr-TR'));
      if (def) return renderEmoji(def.emojiKey, def.fallbackEmoji);
      return renderItemEmoji(item.itemName, item.emoji ?? '🔮');
    }
    default:
      return renderItemEmoji(item.itemName, item.emoji ?? '📦');
  }
}
