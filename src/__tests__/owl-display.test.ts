import { describe, it, expect } from 'vitest';
import { formatOwlIdentity, getOwlPrimaryName, getOwlSpeciesSubtitle } from '../utils/owl-display';
import { isOwlNicknameClearCommand, validateOwlNickname } from '../utils/owl-nickname';
import { buildSimVsScreen } from '../utils/pvp-ux';
import type { SimPvpResult } from '../systems/pvp-sim';

describe('owl-display', () => {
  it('nickname varken subtitle species olur', () => {
    const identity = formatOwlIdentity({ species: 'Kukumav baykusu', nickname: 'Gece Pençesi' });
    expect(identity.primary).toBe('Gece Pençesi');
    expect(identity.subtitle).toBe('Kukumav baykusu');
  });

  it('nickname yokken Discord adi gosterilir', () => {
    const identity = formatOwlIdentity(
      { species: 'Kukumav baykusu', nickname: null },
      'Avcı123',
    );
    expect(identity.primary).toBe('Avcı123');
    expect(identity.subtitle).toBe('Kukumav baykusu');
    expect(getOwlPrimaryName({ species: 'Kukumav baykusu' }, 'Avcı123')).toBe('Avcı123');
    expect(getOwlSpeciesSubtitle({ species: 'Kukumav baykusu' }, 'Avcı123')).toBe('Kukumav baykusu');
  });

  it('nickname ve Discord adi yokken species kalir', () => {
    const identity = formatOwlIdentity({ species: 'Kukumav baykusu', nickname: null });
    expect(getOwlPrimaryName({ species: 'Kukumav baykusu' })).toBe('Kukumav baykusu');
    expect(getOwlSpeciesSubtitle({ species: 'Kukumav baykusu' })).toBeNull();
    expect(identity.subtitle).toBeNull();
  });

  it('clear komutu validasyonu', () => {
    expect(isOwlNicknameClearCommand('clear')).toBe(true);
    expect(isOwlNicknameClearCommand('CLEAR')).toBe(true);
    const bad = validateOwlNickname('clear');
    expect(bad.ok).toBe(false);
    const good = validateOwlNickname('Gece Pençesi');
    expect(good.ok).toBe(true);
    if (good.ok) expect(good.value).toBe('Gece Pençesi');
  });

  it('VS ekranı tek satırda iki tarafın adını verir', () => {
    const base: Omit<SimPvpResult, 'opponent'> = {
      playerWon: true,
      turns: 2,
      events: [],
      xpGained: 10,
      coinsGained: 60,
      streak: {
        newStreak: 1,
        oldStreak: 0,
        bestStreak: 1,
        isNewRecord: true,
        streakCounted: true,
        xpBonusPct: 0,
        bonusCoins: 0,
        milestoneMsg: null,
      },
    };

    const playerScreen = buildSimVsScreen(
      { species: 'Kukumav baykusu', nickname: 'Gece Pençesi' },
      100,
      {
      ...base,
      opponent: {
        name: 'Gece Pençesi',
        species: 'Kukumav baykusu',
        power: 50,
        hp: 80,
        hpMax: 80,
        stamina: 90,
        difficultyLabel: 'Dengeli',
        xpMult: 1,
        source: 'player',
        flavorLine: '🏹 Başka bir avcının izine rastladın.',
      },
    });
    expect(playerScreen).toBe('⚔️ **Gece Pençesi**  vs  **Gece Pençesi**');
    expect(playerScreen).not.toContain('Başka bir avcının izine rastladın.');
    expect(playerScreen.split('\n')).toHaveLength(1);

    const botScreen = buildSimVsScreen(
      { species: 'Kukumav baykusu' },
      100,
      {
      ...base,
      opponent: {
        name: 'Gölge Avcı',
        species: 'Orman baykuşu',
        power: 50,
        hp: 80,
        hpMax: 80,
        stamina: 90,
        difficultyLabel: 'Kolay',
        xpMult: 0.8,
        source: 'bot',
      },
    },
    'DiscordAvcı',
    );
    expect(botScreen).toBe('⚔️ **DiscordAvcı**  vs  **Gölge Avcı**');
    expect(botScreen).not.toContain('Kukumav baykusu');
    expect(botScreen.split('\n')).toHaveLength(1);
  });
});
