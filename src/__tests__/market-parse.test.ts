import { describe, expect, it } from 'vitest';
import {
  extractSellerNoteFromArgs,
  parseMarketSellItemArgs,
  parseOwlMarketSellArgs,
} from '../utils/market-parse';
import { resolveItemNameFromUseId } from '../utils/use-items';

describe('parseMarketSellItemArgs', () => {
  it('parses item id + price', () => {
    expect(parseMarketSellItemArgs(['013', '1000'])).toEqual({
      itemNameRaw: '013',
      quantity: 1,
      price: 1000,
    });
  });

  it('parses item id + quantity + price', () => {
    expect(parseMarketSellItemArgs(['026', '5', '2500'])).toEqual({
      itemNameRaw: '026',
      quantity: 5,
      price: 2500,
    });
  });

  it('parses legacy item name + quantity + price', () => {
    expect(parseMarketSellItemArgs(['Sessizlik Teli', '1', '1000'])).toEqual({
      itemNameRaw: 'Sessizlik Teli',
      quantity: 1,
      price: 1000,
    });
  });

  it('parses item name without quantity', () => {
    expect(parseMarketSellItemArgs(['Karma Yem', '500'])).toEqual({
      itemNameRaw: 'Karma Yem',
      quantity: 1,
      price: 500,
    });
  });

  it('parses keyword syntax adet + fiyat', () => {
    expect(parseMarketSellItemArgs(['001', 'adet', '5', 'fiyat', '8000'])).toEqual({
      itemNameRaw: '001',
      quantity: 5,
      price: 8000,
    });
  });

  it('parses compact qty x price', () => {
    expect(parseMarketSellItemArgs(['001', '5x8000'])).toEqual({
      itemNameRaw: '001',
      quantity: 5,
      price: 8000,
    });
  });

  it('parses inline fiyat keyword', () => {
    expect(parseMarketSellItemArgs(['026', 'fiyat:1000'])).toEqual({
      itemNameRaw: '026',
      quantity: 1,
      price: 1000,
    });
  });
});

describe('extractSellerNoteFromArgs', () => {
  it('parses Turkish not suffix', () => {
    const { cleanArgs, sellerNote } = extractSellerNoteFromArgs([
      '001', 'adet', '5', 'fiyat', '8000', 'not', 'toplu', 'satış', 'ucuz',
    ]);
    expect(cleanArgs).toEqual(['001', 'adet', '5', 'fiyat', '8000']);
    expect(sellerNote).toBe('toplu satış ucuz');
  });
});

describe('parseOwlMarketSellArgs', () => {
  it('parses owl fiyat keyword', () => {
    expect(parseOwlMarketSellArgs(['A1B2', 'fiyat', '50000'])).toEqual({
      owlIdInput: 'A1B2',
      price: 50000,
    });
  });
});

describe('resolveItemNameFromUseId', () => {
  it('resolves buff id', () => {
    expect(resolveItemNameFromUseId('001')).toBeTruthy();
  });

  it('does not resolve removed consumable id', () => {
    expect(resolveItemNameFromUseId('013')).toBeNull();
  });

  it('resolves material id', () => {
    expect(resolveItemNameFromUseId('026')).toBe('Sessizlik Teli');
    expect(resolveItemNameFromUseId('21')).toBe('Kemik Tozu');
  });
});
