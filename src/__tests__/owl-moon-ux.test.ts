import { describe, it, expect } from 'vitest';
import { buildMoonEvolutionMessage, buildMoonEvolutionFollowUp } from '../utils/owl-moon-ux';
import type { MoonEvolutionResult } from '../systems/owl-moon-evolution';

const baseResult: MoonEvolutionResult = {
  owlId: 'owl-1',
  ownerId: 'user-42',
  speciesTier: 1,
  displayName: 'Gece Pençesi',
  oldMoonTier: 1,
  newMoonTier: 2,
  power: 84,
};

describe('owl-moon-ux', () => {
  it('buildMoonEvolutionFollowUp mentions owner with compact celebration body', () => {
    const payload = buildMoonEvolutionFollowUp(baseResult, 'w');
    expect(payload.content).toContain('<@user-42>');
    expect(payload.allowedMentions).toEqual({ users: ['user-42'] });
    expect(payload.content).toContain('AY EVRİMİ');
    expect('embeds' in payload).toBe(false);
  });

  it('buildMoonEvolutionMessage uses custom moon and owl emojis', () => {
    const text = buildMoonEvolutionMessage(baseResult, 'w');

    expect(text).toContain('moon_1_quarter');
    expect(text).toContain('moon_2_half');
    expect(text).toContain('owl_1_t1');
    expect(text).toContain('owl_1_t2');
    expect(text).toMatch(/moon_1_quarter:.*owl_1_t1/);
    expect(text).toMatch(/moon_2_half:.*owl_1_t2/);
    expect(text).toContain('✦✦✦');
    expect(text).toContain('**Gece Pençesi** artık **Moon II**');
    expect(text).toContain('🔓 **Parlak Gözler**');
    expect(text).toContain('Baykuşunun gözleri geceyi aydınlatacak kadar parladı..');
    expect(text).toContain('`w owls` · vitrin güncellendi');
    expect(text).not.toContain('| ');
    expect(text).not.toContain('Güç:');
  });

  it('buildMoonEvolutionMessage combines title and aura unlocks', () => {
    const text = buildMoonEvolutionMessage({
      ...baseResult,
      oldMoonTier: 2,
      newMoonTier: 3,
      power: 154,
    }, 'w');
    expect(text).toContain('🔓 **Gece Avcısı** · **Gece Aurası**');
    expect(text).toContain('Gece avcısı olarak tanınıyor.');
  });

  it('buildMoonEvolutionMessage shows final tier only on multi jump', () => {
    const text = buildMoonEvolutionMessage({
      ...baseResult,
      oldMoonTier: 1,
      newMoonTier: 3,
      power: 190,
    }, 'w');
    expect(text).toContain('**Moon III**');
    expect(text.match(/Moon (I{1,3}|IV|V|VI|VII)/g)).toEqual(['Moon III']);
    expect(text).toContain('moon_1_quarter');
    expect(text).toContain('moon_3_full');
    expect(text).toContain('owl_1_t1');
    expect(text).toContain('owl_1_t3');
  });
});
