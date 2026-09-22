import { describe, expect, it } from 'vitest';
import {
  buildBackCustomId,
  buildItemScreenCustomId,
  buildScreenCustomId,
  buildSelectCustomId,
  decodeFrom,
  encodeFrom,
  isDeferredMarketScreen,
  isMarketCustomId,
  parseMarketCustomId,
  parseBuyActionParams,
  resolveSelectTarget,
} from '../utils/market-customid';

describe('market-customid', () => {
  it('isMarketCustomId matches mk: prefix', () => {
    expect(isMarketCustomId('mk:hub')).toBe(true);
    expect(isMarketCustomId('market_cat:owl')).toBe(false);
  });

  it('encodeFrom / decodeFrom round-trip', () => {
    expect(encodeFrom('cat:owl:0')).toBe('cat.owl.0');
    expect(decodeFrom('cat.owl.0')).toBe('cat:owl:0');
  });

  it('buildItemScreenCustomId encodes from path', () => {
    expect(buildItemScreenCustomId(42, 'cat:owl:0')).toBe('mk:item:42:cat.owl.0');
  });

  it('buildBackCustomId decodes from segment', () => {
    expect(buildBackCustomId('cat.owl.0')).toBe('mk:cat:owl:0');
  });

  it('parseMarketCustomId detects screen, select, action', () => {
    expect(parseMarketCustomId('mk:hub')).toEqual({ kind: 'screen', screenPath: 'hub' });
    expect(parseMarketCustomId('mk:cat:owl:0:select')).toEqual({
      kind: 'select',
      screenPath: 'cat:owl:0',
    });
    expect(parseMarketCustomId('mk:action:buyconfirm:42:cat.owl.0')).toEqual({
      kind: 'action',
      screenPath: 'action:buyconfirm:42:cat.owl.0',
      action: 'buyconfirm',
      actionParams: ['42', 'cat.owl.0'],
    });
  });

  it('resolveSelectTarget maps hub category pick to browse screen', () => {
    expect(resolveSelectTarget('mk:hub:select', 'cat.buff.0')).toBe('mk:cat:buff:0');
  });

  it('resolveSelectTarget maps listing pick to item detail', () => {
    expect(resolveSelectTarget('mk:cat:owl:1:select', 'item.99')).toBe('mk:item:99:cat.owl.1');
  });

  it('resolveSelectTarget maps shop pick', () => {
    expect(resolveSelectTarget('mk:search:results:select', 'shop.user-abc')).toBe(
      'mk:shop:user-abc',
    );
  });

  it('resolveSelectTarget maps search item pick with from=search', () => {
    expect(resolveSelectTarget('mk:search:results:select', 'item.99.search')).toBe(
      'mk:item:99:search',
    );
  });

  it('isDeferredMarketScreen returns false after search phase', () => {
    expect(isDeferredMarketScreen('search:open')).toBe(false);
    expect(isDeferredMarketScreen('search:results')).toBe(false);
  });

  it('resolveSelectTarget routes myshop item to management screen', () => {
    expect(resolveSelectTarget('mk:myshop:select', 'item.12')).toBe('mk:myshop:item:12');
  });

  it('parseBuyActionParams extracts listingNo and from', () => {
    expect(parseBuyActionParams(['42', 'cat.owl.0'])).toEqual({
      listingNo: 42,
      fromEncoded: 'cat.owl.0',
    });
  });

  it('buildScreenCustomId and buildSelectCustomId', () => {
    expect(buildScreenCustomId('hub')).toBe('mk:hub');
    expect(buildSelectCustomId('hub')).toBe('mk:hub:select');
  });
});
