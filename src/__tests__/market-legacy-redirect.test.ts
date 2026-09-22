import { describe, expect, it } from 'vitest';
import {
  buildMarketLegacyHint,
  buildMarketSellLegacyHint,
  resolveLegacyMarketIntent,
} from '../utils/market-legacy-redirect';

describe('resolveLegacyMarketIntent', () => {
  it('redirects market search to pazar query', () => {
    const action = resolveLegacyMarketIntent(['search', 'savunma']);
    expect(action).toEqual({
      type: 'search',
      query: 'savunma',
      legacyLabel: '`market search savunma`',
    });
    expect(buildMarketLegacyHint('w', action!)).toContain('`w pazar savunma`');
  });

  it('redirects free-text seller/product query to pazar', () => {
    const action = resolveLegacyMarketIntent(['kifoz']);
    expect(action?.type).toBe('search');
    expect((action as { query: string }).query).toBe('kifoz');
  });

  it('redirects category browse to market hub', () => {
    const action = resolveLegacyMarketIntent(['buff']);
    expect(action).toEqual({ type: 'hub', legacyLabel: '`market buff`' });
    expect(buildMarketLegacyHint('w', action!)).toContain('`w market`');
  });

  it('redirects nav id to market hub', () => {
    const action = resolveLegacyMarketIntent(['5']);
    expect(action?.type).toBe('hub');
  });

  it('redirects my listings to myshop screen', () => {
    const action = resolveLegacyMarketIntent(['my']);
    expect(action).toEqual({ type: 'myshop', legacyLabel: '`market my`' });
  });

  it('returns null for empty args', () => {
    expect(resolveLegacyMarketIntent([])).toBeNull();
  });
});

describe('buildMarketSellLegacyHint', () => {
  it('points to w sat', () => {
    expect(buildMarketSellLegacyHint('w', '`market sell`')).toContain('`w sat`');
  });
});
