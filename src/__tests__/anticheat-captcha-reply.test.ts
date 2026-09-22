import { describe, expect, it } from 'vitest';
import { looksLikeCaptchaAnswer } from '../anticheat/captcha-reply';

describe('looksLikeCaptchaAnswer', () => {
  it('accepts 4-char alphanumeric codes', () => {
    expect(looksLikeCaptchaAnswer('epTw')).toBe(true);
    expect(looksLikeCaptchaAnswer('Ab3x')).toBe(true);
  });

  it('rejects bot commands and partial input', () => {
    expect(looksLikeCaptchaAnswer('wh')).toBe(false);
    expect(looksLikeCaptchaAnswer('wd')).toBe(false);
    expect(looksLikeCaptchaAnswer('owl hunt')).toBe(false);
    expect(looksLikeCaptchaAnswer('abcd1')).toBe(false);
  });
});
