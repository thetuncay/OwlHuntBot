import { describe, it, expect } from 'vitest';
import { getMoonTierProgress } from '../config/owl-moon-tier';
import { buildEvrimMessage } from '../utils/evrim-ux';

describe('getMoonTierProgress', () => {
  it('returns remaining power to next tier', () => {
    const progress = getMoonTierProgress(120);
    expect(progress.currentTier).toBe(2);
    expect(progress.nextTier).toBe(3);
    expect(progress.remaining).toBe(70);
    expect(progress.nextThreshold).toBe(190);
    expect(progress.atMax).toBe(false);
  });

  it('marks max tier at Moon VII', () => {
    const progress = getMoonTierProgress(600);
    expect(progress.currentTier).toBe(7);
    expect(progress.atMax).toBe(true);
    expect(progress.remaining).toBeNull();
  });
});

describe('evrim-ux', () => {
  it('buildEvrimMessage shows moon tier progress with custom emojis', () => {
    const text = buildEvrimMessage({
      displayName: 'Gece Pençesi',
      speciesTier: 1,
      progress: getMoonTierProgress(120),
    }, 'w');

    expect(text).toContain('moon_2_half');
    expect(text).toContain('owl_1_t2');
    expect(text).toContain('**Gece Pençesi** · **Moon II**');
    expect(text).toContain('Güç **120**');
    expect(text).toContain('moon_3_full');
    expect(text).toContain('**Moon III** · **70** kaldı');
    expect(text).toContain('**120/190**');
    expect(text).toContain('🔓 **Gece Avcısı** · **Gece Aurası**');
    expect(text).toContain('`w upgrade` ile stat yükselt');
  });

  it('buildEvrimMessage shows max tier message', () => {
    const text = buildEvrimMessage({
      displayName: 'Ay Efendisi',
      speciesTier: 8,
      progress: getMoonTierProgress(600),
    }, 'w');
    expect(text).toContain('Maksimum ay kademesi');
    expect(text).not.toContain('kaldı');
  });
});
