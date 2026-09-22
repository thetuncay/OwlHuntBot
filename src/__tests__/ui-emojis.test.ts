import { describe, expect, it } from 'vitest';
import { GAME_ENTITY_EMOJI_BY_NAME } from '../config/game-entity-emoji-ids';
import {
  COIN_EMOJI,
  XP_EMOJI,
  renderCoinEmoji,
  renderXpEmoji,
} from '../config/ui-emojis';

describe('ui-emojis', () => {
  it('XP yıldızı custom emoji', () => {
    const id = GAME_ENTITY_EMOJI_BY_NAME.xpyildiz.id;
    expect(renderXpEmoji()).toBe(`<:xpyildiz:${id}>`);
    expect(String(XP_EMOJI)).toContain('xpyildiz');
  });

  it('para çantası custom emoji', () => {
    const id = GAME_ENTITY_EMOJI_BY_NAME.paracantasi.id;
    expect(renderCoinEmoji()).toBe(`<:paracantasi:${id}>`);
    expect(String(COIN_EMOJI)).toContain('paracantasi');
  });
});
