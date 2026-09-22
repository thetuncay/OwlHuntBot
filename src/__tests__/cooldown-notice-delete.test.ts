import { afterEach, describe, expect, it, vi } from 'vitest';
import { COOLDOWN_NOTICE_AUTO_DELETE_MS } from '../config';
import { scheduleMessageAutoDelete } from '../utils/guarded-discord';
import { SuppressionKeys } from '../utils/response-suppression';

describe('scheduleMessageAutoDelete', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('deletes after configured delay', () => {
    vi.useFakeTimers();
    const del = vi.fn(async () => undefined);
    const msg = { delete: del } as unknown as import('discord.js').Message;
    scheduleMessageAutoDelete(msg, COOLDOWN_NOTICE_AUTO_DELETE_MS);
    expect(del).not.toHaveBeenCalled();
    vi.advanceTimersByTime(COOLDOWN_NOTICE_AUTO_DELETE_MS - 1);
    expect(del).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(del).toHaveBeenCalledTimes(1);
  });

  it('no-ops on null message', () => {
    expect(() => scheduleMessageAutoDelete(null)).not.toThrow();
  });

  it('cooldown suppression keys are identifiable', () => {
    expect(SuppressionKeys.cooldown('cooldown:hunt:u1').startsWith('cooldown:')).toBe(true);
  });
});
