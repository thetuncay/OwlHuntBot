import { describe, it, expect, vi } from 'vitest';
import { logGuildAudit } from '../systems/guild-lifecycle';

describe('guild-lifecycle audit', () => {
  it('logGuildAudit emits JSON with GuildAudit prefix', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    logGuildAudit({
      event: 'guild.join',
      guildId: 'g1',
      guildName: 'Test',
      memberCount: 10,
      ownerId: 'o1',
      totalGuilds: 1,
      maxGuilds: 50,
      shardId: '0',
      action: 'accepted',
    });
    expect(spy).toHaveBeenCalledOnce();
    const line = spy.mock.calls[0]![0] as string;
    expect(line).toContain('[GuildAudit]');
    expect(line).toContain('"event":"guild.join"');
    expect(line).toContain('"guildId":"g1"');
    spy.mockRestore();
  });
});
