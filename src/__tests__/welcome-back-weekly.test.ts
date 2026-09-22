import { describe, expect, it } from 'vitest';
import {
  DAILY_LOGIN_BASE_COIN,
  WELCOME_BACK_COINS,
  WELCOME_BACK_MIN_AWAY_DAYS,
} from '../config';
import {
  buildWelcomeBackMessage,
  computeAwayDays,
  isWelcomeBackEligible,
} from '../systems/welcome-back';
import {
  WEEKLY_RITUAL_LINES,
  isoWeekKey,
  pickWeeklyRitualLine,
} from '../systems/weekly-ritual';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-09-14T12:00:00Z');

describe('isWelcomeBackEligible (A7)', () => {
  it('yeni oyuncuya paket vermez', () => {
    expect(isWelcomeBackEligible(null, NOW)).toBe(false);
  });

  it('eşiğin altındaki arada paket vermez', () => {
    const last = new Date(NOW.getTime() - (WELCOME_BACK_MIN_AWAY_DAYS - 1) * DAY_MS);
    expect(isWelcomeBackEligible(last, NOW)).toBe(false);
  });

  it('eşikte paket verir', () => {
    const last = new Date(NOW.getTime() - WELCOME_BACK_MIN_AWAY_DAYS * DAY_MS);
    expect(isWelcomeBackEligible(last, NOW)).toBe(true);
  });

  it('uzun aradan sonra paket verir', () => {
    const last = new Date(NOW.getTime() - 90 * DAY_MS);
    expect(isWelcomeBackEligible(last, NOW)).toBe(true);
  });

  it('dün oynayan oyuncuya paket vermez — farming kapısı kapalı', () => {
    expect(isWelcomeBackEligible(new Date(NOW.getTime() - DAY_MS), NOW)).toBe(false);
  });
});

describe('welcome-back ekonomik denge', () => {
  // A7 uyarısı: "Cömert değil, karşılayıcı olsun."
  // Ara vermek, aynı süre düzenli oynamaktan asla kârlı olmamalı.
  it('paket, eşik süresi boyunca düzenli login kazancından küçük', () => {
    const regularEarnings = WELCOME_BACK_MIN_AWAY_DAYS * DAILY_LOGIN_BASE_COIN;
    expect(WELCOME_BACK_COINS).toBeLessThan(regularEarnings);
  });
});

describe('computeAwayDays', () => {
  it('tam gün sayısını verir', () => {
    expect(computeAwayDays(new Date(NOW.getTime() - 9 * DAY_MS), NOW)).toBe(9);
  });

  it('kayıt yoksa sıfır', () => {
    expect(computeAwayDays(null, NOW)).toBe(0);
  });
});

describe('buildWelcomeBackMessage', () => {
  const grant = { awayDays: 12, coins: 300, equipmentCrates: 1 };

  it('gün sayısını ve hediyeyi yazar', () => {
    const msg = buildWelcomeBackMessage(grant);
    expect(msg).toContain('12 gün');
    expect(msg).toContain('300 coin');
  });

  it('ceza veya seri dili kullanmaz', () => {
    const msg = buildWelcomeBackMessage(grant).toLowerCase();
    for (const word of ['seri', 'kaybettin', 'kırıldı', 'ceza', 'maalesef']) {
      expect(msg, word).not.toContain(word);
    }
  });

  it('kutu yoksa kutu satırı yazmaz', () => {
    const msg = buildWelcomeBackMessage({ ...grant, equipmentCrates: 0 });
    expect(msg).not.toContain('Kutu');
  });
});

// ── I2 haftalık ritüel ───────────────────────────────────────────────────────

describe('isoWeekKey', () => {
  it('YYYY-Www biçiminde döner', () => {
    expect(isoWeekKey(NOW)).toMatch(/^\d{4}-W\d{2}$/);
  });

  it('aynı hafta içindeki günler aynı anahtarı verir', () => {
    // 2026-09-14 pazartesi, 2026-09-20 pazar — aynı ISO haftası.
    expect(isoWeekKey(new Date('2026-09-14T00:00:00Z')))
      .toBe(isoWeekKey(new Date('2026-09-20T23:59:00Z')));
  });

  it('hafta sınırında anahtar değişir', () => {
    expect(isoWeekKey(new Date('2026-09-20T23:59:00Z')))
      .not.toBe(isoWeekKey(new Date('2026-09-21T00:01:00Z')));
  });
});

describe('pickWeeklyRitualLine', () => {
  it('havuzdan bir satır döner', () => {
    expect(WEEKLY_RITUAL_LINES).toContain(pickWeeklyRitualLine('2026-W37'));
  });

  it('aynı hafta hep aynı satırı verir — deterministik', () => {
    expect(pickWeeklyRitualLine('2026-W37')).toBe(pickWeeklyRitualLine('2026-W37'));
  });

  it('havuz tekdüzeliği kıracak kadar geniş', () => {
    expect(WEEKLY_RITUAL_LINES.length).toBeGreaterThanOrEqual(3);
  });

  it('ardışık haftalarda varyasyon üretir', () => {
    const seen = new Set<string>();
    for (let week = 1; week <= 20; week++) {
      seen.add(pickWeeklyRitualLine(`2026-W${String(week).padStart(2, '0')}`));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('hiçbir varyant kaçırdın/ceza dili içermez', () => {
    for (const line of WEEKLY_RITUAL_LINES) {
      const lower = line.toLowerCase();
      expect(lower, line).not.toContain('kaçırdın');
      expect(lower, line).not.toContain('sıfırlandı');
    }
  });
});
