import { describe, expect, it } from 'vitest';
import {
  expandMarketArgs,
  expandMarketCommandText,
} from '../utils/market-alias';
import {
  resolvePrefixCommandText,
  stripGluedPrefix,
} from '../utils/alias-command';

describe('expandMarketCommandText', () => {
  it('expands glued shortcuts to market hub', () => {
    expect(expandMarketCommandText('mb')).toBe('market');
    expect(expandMarketCommandText('mo')).toBe('market');
    expect(expandMarketCommandText('m b')).toBe('market b');
    expect(expandMarketCommandText('m o')).toBe('market o');
  });

  it('expands sell and buy subcommand shortcuts', () => {
    expect(expandMarketCommandText('ms')).toBe('market sell');
    expect(expandMarketCommandText('mp 14')).toBe('market buy 14');
    expect(expandMarketCommandText('m s owl A1 5000')).toBe('market sell owl A1 5000');
    expect(expandMarketCommandText('md 9')).toBe('market 9');
    expect(expandMarketCommandText('my')).toBe('market');
    expect(expandMarketCommandText('mr savunma')).toBe('pazar savunma');
  });
});

describe('expandMarketArgs', () => {
  it('maps sell and buy tokens only', () => {
    expect(expandMarketArgs(['s'])).toEqual(['sell']);
    expect(expandMarketArgs(['p', '14'])).toEqual(['buy', '14']);
    expect(expandMarketArgs(['buff'])).toEqual(['buff']);
  });
});

describe('prefix integration', () => {
  it('resolves wmb to market hub', () => {
    expect(resolvePrefixCommandText('wmb', 'w')).toBe('market');
    expect(resolvePrefixCommandText('w m b', 'w')).toBe('market b');
    expect(stripGluedPrefix('wmb', 'w')).toBe('mb');
  });

  it('does not steal wb duel shortcut', () => {
    expect(resolvePrefixCommandText('wb', 'w')).toBe('b');
  });

  it('resolves owl wms to market sell', () => {
    expect(resolvePrefixCommandText('owl wms', 'w')).toBe('market sell');
    expect(resolvePrefixCommandText('owl mp 14', 'w')).toBe('market buy 14');
  });
});
