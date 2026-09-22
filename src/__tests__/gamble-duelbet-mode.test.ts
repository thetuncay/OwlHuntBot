import { describe, expect, it } from 'vitest';

describe('simulatePvP duelBetMode', () => {
  it('duelBetMode skips default +100 coin path in source', async () => {
    const source = await import('fs/promises').then((fs) =>
      fs.readFile(new URL('../systems/pvp.ts', import.meta.url), 'utf8'),
    );
    expect(source).toContain('duelBetMode');
    expect(source).toContain('totalCoinGain = duelBetMode ? 0 : 100');
    expect(source).toContain('if (redis && !duelBetMode)');
    expect(source).toContain('if (winnerPlayer && !duelBetMode)');
  });
});
