import { describe, expect, it } from 'vitest';
import { COIN_EMOJI, XP_EMOJI } from '../config/ui-emojis';
import {
  buildDuelResultMessage,
  formatDuelLevelLine,
  formatDuelRewardLine,
  formatDuelStreakLine,
  formatDuelTurnsLine,
} from '../utils/duel-ux';

describe('duel-ux v2.0', () => {
  it('formatDuelRewardLine — XP ve Coin tek satır', () => {
    const line = formatDuelRewardLine(67, 130);
    expect(line).toContain(XP_EMOJI);
    expect(line).toContain(COIN_EMOJI);
    expect(line).toContain('+67 XP');
    expect(line).toContain('+130 Coin');
    expect(line.startsWith('┃ ')).toBe(true);
  });

  it('formatDuelLevelLine — 10 segment bar, yüzde yok', () => {
    const line = formatDuelLevelLine(12, 11060);
    expect(line).toMatch(/Lv\.12/);
    expect(line).toMatch(/▰|▱/);
    expect(line).not.toContain('%');
    expect(line).not.toContain('için');
    expect(line).not.toContain('(');
  });

  it('formatDuelStreakLine — streak yoksa null', () => {
    expect(formatDuelStreakLine({ newStreak: 0, oldStreak: 0, streakCounted: true })).toBeNull();
    expect(formatDuelStreakLine({ newStreak: 2, oldStreak: 2, streakCounted: true })).toBeNull();
    expect(formatDuelStreakLine({ newStreak: 2, oldStreak: 1, streakCounted: false })).toBeNull();
  });

  it('formatDuelStreakLine — aktif streak', () => {
    expect(formatDuelStreakLine({ newStreak: 2, oldStreak: 1, streakCounted: true })).toBe(
      '┃ 🔥 Streak ×2 (+1)',
    );
  });

  it('buildDuelResultMessage — yalnızca kazanan satırı', () => {
    const msg = buildDuelResultMessage({
      winnerName: 'Tuncay',
      loserName: 'NorthTR14P',
      xpGained: 67,
      coinsGained: 130,
      level: 12,
      currentXp: 11060,
      totalTurns: 4,
      streak: { newStreak: 2, oldStreak: 1, streakCounted: true },
    });

    expect(msg).toBe('🏆 **Tuncay** düelloyu kazandı.');
    expect(msg.split('\n')).toHaveLength(1);
  });

  it('buildDuelResultMessage — ödül, seviye, streak ve tur dökümü gösterilmez', () => {
    const msg = buildDuelResultMessage({
      winnerName: 'Ali',
      loserName: 'Bot',
      xpGained: 50,
      coinsGained: 100,
      level: 5,
      currentXp: 200,
      totalTurns: 3,
      streak: { newStreak: 2, oldStreak: 1, streakCounted: true },
    });

    expect(msg).toBe('🏆 **Ali** düelloyu kazandı.');
    expect(msg).not.toContain('Streak');
    expect(msg).not.toContain('XP');
    expect(msg).not.toContain('Coin');
    expect(msg).not.toContain('Lv.');
    expect(msg).not.toContain('Tur');
    expect(msg).not.toContain('Bot');
  });
});
