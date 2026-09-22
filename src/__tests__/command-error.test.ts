import { describe, expect, it } from 'vitest';
import {
  buildCooldownMessage,
  buildSpamMuteMessage,
  coerceMuteSeconds,
} from '../utils/command-error';

describe('buildSpamMuteMessage', () => {
  it('shows seconds for 15s mute', () => {
    const msg = buildSpamMuteMessage('Tuncay', 15);
    expect(msg).toContain('**15 saniye**');
    expect(msg).not.toContain('saat');
    expect(msg).toContain('lütfen yavaşla Çok hızlısın');
  });

  it('coerces mistaken milliseconds (15000ms → 15s)', () => {
    expect(coerceMuteSeconds(15000)).toBe(15);
    const msg = buildSpamMuteMessage('Test', 15000);
    expect(msg).toContain('**15 saniye**');
    expect(msg).not.toContain('8 saat');
  });
});

describe('L4: buildCooldownMessage — nötr dil (azarlayıcı ifadeler kaldırıldı)', () => {
  it('hunt cooldown message drops "yavaşla / sakin ol / acele etme"', () => {
    const msg = buildCooldownMessage(5000, 'hunt', 'Efe');
    expect(msg).toContain('**5 saniye**');
    expect(msg).toContain('tekrar avlanabiliriz');
    // Azarlayıcı dil kaldırıldı (L4)
    expect(msg).not.toContain('yavaşla');
    expect(msg).not.toContain('sakin ol');
    expect(msg).not.toContain('acele etme');
  });

  it('all cooldown actions use neutral phrasing', () => {
    const actions = ['duel', 'upgrade', 'transfer', 'slot', 'switch', 'blackjack', 'coinflip', 'pvp_gamble', 'generic'] as const;
    for (const a of actions) {
      const msg = buildCooldownMessage(30_000, a, 'Efe');
      expect(msg).not.toMatch(/yavaşla|sakin ol|acele etme/);
    }
  });

  it('keeps duration + retry cue', () => {
    const msg = buildCooldownMessage(60_000, 'hunt', 'Efe');
    expect(msg).toContain('Efe');
    expect(msg).toContain('sonra');
    expect(msg).toContain('avlan'); // ...avlanabiliriz
  });
});
