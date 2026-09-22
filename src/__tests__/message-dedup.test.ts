import { describe, expect, it } from 'vitest';
import {
  acquireMessageProcessingLock,
  tryAcquireLocalMessageLock,
} from '../middleware/message-dedup';

function createDedupRedisMock() {
  const store = new Map<string, string>();
  return {
    set: async (key: string, value: string, ...args: unknown[]) => {
      const hasNx = (args as string[]).includes('NX');
      if (hasNx && store.has(key)) return null;
      store.set(key, value);
      return 'OK';
    },
  };
}

describe('tryAcquireLocalMessageLock', () => {
  it('rejects duplicate message id in same process', () => {
    expect(tryAcquireLocalMessageLock('msg-1')).toBe(true);
    expect(tryAcquireLocalMessageLock('msg-1')).toBe(false);
    expect(tryAcquireLocalMessageLock('msg-2')).toBe(true);
  });
});

describe('acquireMessageProcessingLock', () => {
  it('allows first claim and rejects duplicate message id', async () => {
    const redis = createDedupRedisMock();
    const first = await acquireMessageProcessingLock(redis as any, 'msg-1');
    const second = await acquireMessageProcessingLock(redis as any, 'msg-1');
    const other = await acquireMessageProcessingLock(redis as any, 'msg-2');

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(other).toBe(true);
  });
});
