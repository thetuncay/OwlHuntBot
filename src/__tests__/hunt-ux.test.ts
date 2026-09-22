import { describe, expect, it } from 'vitest';
import { COIN_EMOJI, XP_EMOJI } from '../config/ui-emojis';
import { chargeBadge } from '../utils/theme';
import { buildFinalMessage, type CompressedHunt } from '../utils/hunt-ux';

function sample(compressed: Partial<CompressedHunt>): CompressedHunt {
  return {
    groups: [],
    totalXP: 0,
    totalValue: 0,
    hasCritical: false,
    hasRareCatch: false,
    levelUp: null,
    isEmpty: true,
    ...compressed,
  };
}

describe('buildFinalMessage v2.0', () => {
  it('tam format — loot, XP, Coin, buff', () => {
    const msg = buildFinalMessage('Tuncay', sample({
      isEmpty: false,
      groups: [
        { name: 'Baykuş', emoji: '🦉', count: 2, sellPrice: 100, totalValue: 200 },
        { name: 'Fare', emoji: '🐀', count: 4, sellPrice: 50, totalValue: 200 },
        { name: 'Yılan', emoji: '🐍', count: 1, sellPrice: 80, totalValue: 80 },
        { name: 'Tüy', emoji: '🪶', count: 3, sellPrice: 10, totalValue: 30 },
      ],
      totalXP: 118,
      totalValue: 1245,
      activeBuffs: [
        { emoji: '🍀', chargeCur: 32, chargeMax: 120 },
        { emoji: '📜', chargeCur: 19, chargeMax: 60 },
        { emoji: '🐚', chargeCur: 25, chargeMax: 40 },
      ],
    }));

    expect(msg).toBe(
      [
        '🌙 Tuncay, avdan döndü.',
        `┃🍀${chargeBadge(32, 120)}   📜${chargeBadge(19, 60)}   🐚${chargeBadge(25, 40)}`,
        '┃🦉×2 🐀×4 🐍×1 🪶×3',
        `┃ ${XP_EMOJI} **XP: 118**    ${COIN_EMOJI} **Coin: 1.245**`,
      ].join('\n'),
    );
  });

  it('loot yoksa — satırı', () => {
    const msg = buildFinalMessage('Ali', sample({ totalXP: 5, totalValue: 0 }));
    expect(msg).toContain('┃ —');
    expect(msg).not.toMatch(/┃ 🍀/);
  });

  it('buff yoksa buff satırı gizlenir', () => {
    const msg = buildFinalMessage('Ali', sample({
      isEmpty: false,
      groups: [{ name: 'Fare', emoji: '🐀', count: 1, sellPrice: 5, totalValue: 5 }],
      totalXP: 10,
      totalValue: 5,
      activeBuffs: [],
    }));

    const lines = msg.split('\n');
    expect(lines).toHaveLength(3);
    expect(msg).toContain('**XP:');
    expect(msg).not.toContain('Harika');
    expect(msg).not.toContain('Başarılı');
  });

  it('charge 0 buff gösterilmez', () => {
    const msg = buildFinalMessage('Ali', sample({
      totalXP: 1,
      totalValue: 0,
      activeBuffs: [{ emoji: '🍀', chargeCur: 0, chargeMax: 120 }],
    }));
    expect(msg.split('\n')).toHaveLength(3);
  });
});
