import { describe, expect, it } from 'vitest';
import {
  resolvePlayerDisplayName,
  validateLeaderboardDisplayName,
} from '../utils/player-display-name';

describe('resolvePlayerDisplayName', () => {
  it('prefers custom leaderboard name', () => {
    expect(
      resolvePlayerDisplayName({
        leaderboardName: 'AvcıX',
        registrations: [{ displayName: 'Discord', username: 'user' }],
      }),
    ).toBe('AvcıX');
  });

  it('falls back to registration', () => {
    expect(
      resolvePlayerDisplayName({
        leaderboardName: null,
        registrations: [{ displayName: 'Sunucu Adı', username: 'user' }],
      }),
    ).toBe('Sunucu Adı');
  });
});

describe('validateLeaderboardDisplayName', () => {
  it('accepts valid names', () => {
    expect(validateLeaderboardDisplayName('  Baykuş Avcısı  ')).toBe('Baykuş Avcısı');
  });

  it('rejects too short', () => {
    expect(() => validateLeaderboardDisplayName('a')).toThrow();
  });
});
