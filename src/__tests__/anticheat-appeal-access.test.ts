import { describe, expect, it } from 'vitest';
import { createAppealAccessToken, verifyAppealAccessToken } from '../anticheat/appeal-access';

describe('anticheat-appeal-access', () => {
  it('creates and verifies token for user', () => {
    const token = createAppealAccessToken('user-123');
    const parsed = verifyAppealAccessToken(token);
    expect(parsed?.userId).toBe('user-123');
  });

  it('rejects malformed token', () => {
    expect(verifyAppealAccessToken('invalid')).toBeNull();
  });
});
