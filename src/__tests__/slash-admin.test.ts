import { describe, expect, it } from 'vitest';
import { isGuildAdminCommand } from '../utils/slash-admin';

describe('slash-admin', () => {
  it('admin komutlarini tanir', () => {
    expect(isGuildAdminCommand('admin')).toBe(true);
    expect(isGuildAdminCommand('admin-ban')).toBe(true);
    expect(isGuildAdminCommand('admin-uyari')).toBe(true);
    expect(isGuildAdminCommand('anticheat')).toBe(true);
    expect(isGuildAdminCommand('appeal')).toBe(true);
  });

  it('oyuncu komutlarini reddeder', () => {
    expect(isGuildAdminCommand('owl')).toBe(false);
    expect(isGuildAdminCommand('lb')).toBe(false);
    expect(isGuildAdminCommand('duelbet')).toBe(false);
    expect(isGuildAdminCommand('owlonly')).toBe(false);
  });
});
