import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  allEmojiDefs,
  renderBuffEmoji,
  renderEmoji,
  renderItemEmoji,
  renderLootboxEmoji,
  renderOwlEmoji,
  renderOwlMoonEmoji,
  renderMoonEmoji,
  renderPreyEmoji,
} from '../config/custom-emojis';
import { GAME_ENTITY_EMOJI_BY_NAME } from '../config/game-entity-emoji-ids';
import { OWL_EVOLUTION_EMOJI_BY_NAME } from '../config/owl-evolution-emoji-ids';
import {
  resetApplicationEmojiHydrateForTests,
  setApplicationEmojisForTests,
} from '../config/emoji-runtime';

describe('custom-emojis', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved.EMOJI_PREY_SERCE = process.env.EMOJI_PREY_SERCE;
    delete process.env.EMOJI_PREY_SERCE;
    resetApplicationEmojiHydrateForTests();
  });

  afterEach(() => {
    resetApplicationEmojiHydrateForTests();
    if (saved.EMOJI_PREY_SERCE !== undefined) {
      process.env.EMOJI_PREY_SERCE = saved.EMOJI_PREY_SERCE;
    } else {
      delete process.env.EMOJI_PREY_SERCE;
    }
  });

  it('registry contains moon evolution + game entities', () => {
    const defs = allEmojiDefs();
    expect(defs.length).toBeGreaterThanOrEqual(90);
    expect(defs.some((d) => d.key.startsWith('moon.'))).toBe(true);
    expect(defs.some((d) => d.key.startsWith('owl.s'))).toBe(true);
    expect(defs.some((d) => d.key.startsWith('rune.'))).toBe(true);
    expect(defs.every((d) => /^(moon|owl|prey|lootbox|buff|item|rune|rarity|ui)\./.test(d.key))).toBe(true);
  });

  it('renders prey, item, buff, lootbox, owl moon emojis', () => {
    expect(renderPreyEmoji('kaz')).toContain('kaz');
    expect(renderItemEmoji('Kemik Tozu')).toContain('owl_item_kemik');
    expect(renderBuffEmoji('Keskin Nişan')).toContain('owl_buff_keskin');
    expect(renderLootboxEmoji('sk')).toContain('owl_loot_sk');
    expect(renderLootboxEmoji('ek')).toContain('owl_loot_ek');
    expect(renderOwlEmoji(3)).toContain('owl_3_t1');
    expect(renderMoonEmoji(2)).toContain('moon_2_half');
  });

  it('falls back to unicode when env overrides id lookup', () => {
    process.env.EMOJI_PREY_SERCE = '9999999999999999999';
    expect(renderPreyEmoji('serce')).toContain('serce:9999999999999999999');
  });

  it('normalizes prey name casing', () => {
    expect(renderPreyEmoji('Kaz')).toContain('kaz');
    expect(renderPreyEmoji('kedi')).toContain('yabankedi');
  });

  it('maps every registry def to a discord emoji id', () => {
    for (const def of allEmojiDefs()) {
      if (def.key.startsWith('rarity.') || def.key === 'ui.soru') continue;
      const id = OWL_EVOLUTION_EMOJI_BY_NAME[def.name]?.id
        ?? GAME_ENTITY_EMOJI_BY_NAME[def.name]?.id;
      expect(id, def.key).toBeTruthy();
    }
  });

  it('renders rune custom emojis from portal ids', () => {
    expect(renderEmoji('rune.buyulu_tuy')).toContain(`tuyparcasi:${GAME_ENTITY_EMOJI_BY_NAME.tuyparcasi.id}`);
    expect(renderEmoji('rune.kirik_kanat')).toContain(`sessizkanat:${GAME_ENTITY_EMOJI_BY_NAME.sessizkanat.id}`);
    expect(renderEmoji('rune.orman_kalbi')).toContain(`ormanruhu:${GAME_ENTITY_EMOJI_BY_NAME.ormanruhu.id}`);
    expect(renderEmoji('rune.hiclik_ozu')).toContain(`hiclikozu:${GAME_ENTITY_EMOJI_BY_NAME.hiclikozu.id}`);
    expect(renderEmoji('rune.kadim_yumurta')).toContain(`kadim_yumurta:${GAME_ENTITY_EMOJI_BY_NAME.kadim_yumurta.id}`);
  });

  it('portal yazım hatasını canonical emoji adına eşler', () => {
    setApplicationEmojisForTests([{ name: 'ay', id: '111', animated: false }]);
    expect(renderPreyEmoji('ayi')).toContain('ayi:111');
  });

  it('hydrate sonrası uygulamada olmayan isimde unicode fallback kullanır', () => {
    setApplicationEmojisForTests([
      { name: 'tuyparcasi', id: '1528773461218955424' },
    ]);
    expect(renderEmoji('rune.buyulu_tuy')).toContain('tuyparcasi:1528773461218955424');
    expect(renderEmoji('ui.soru', '❓')).toBe('❓');
    expect(renderEmoji('rarity.yaygin', '⚪')).toBe('⚪');
    resetApplicationEmojiHydrateForTests();
  });

  it('renders peceli baykus max moon tier with owl_7_t8', () => {
    const id = OWL_EVOLUTION_EMOJI_BY_NAME.owl_7_t8.id;
    expect(renderOwlMoonEmoji(7, 7)).toContain(`owl_7_t8:${id}`);
  });
});
