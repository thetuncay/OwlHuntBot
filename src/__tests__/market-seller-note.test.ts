import { describe, expect, it } from 'vitest';
import { extractSellerNoteFromArgs, stripTrailingQuotedNote } from '../utils/market-parse';
import { validateMarketSellerNote } from '../utils/market-seller-note';

describe('stripTrailingQuotedNote', () => {
  it('extracts trailing double-quoted note', () => {
    const r = stripTrailingQuotedNote(['owl', 'A1', '19000', '"Duel', 'için."']);
    expect(r.cleanArgs).toEqual(['owl', 'A1', '19000']);
    expect(r.sellerNote).toBe('Duel için.');
  });

  it('leaves args unchanged without quotes', () => {
    const r = stripTrailingQuotedNote(['026', '1', '1000']);
    expect(r.cleanArgs).toEqual(['026', '1', '1000']);
    expect(r.sellerNote).toBeNull();
  });
});

describe('extractSellerNoteFromArgs', () => {
  it('extracts --note with quoted text', () => {
    const r = extractSellerNoteFromArgs(['owl', 'A1', '19000', '--note', '"Duel', 'için."']);
    expect(r.cleanArgs).toEqual(['owl', 'A1', '19000']);
    expect(r.sellerNote).toBe('Duel için.');
  });

  it('extracts --note with bare text', () => {
    const r = extractSellerNoteFromArgs(['026', '1', '1000', '--note', 'Taze', 'malzeme.']);
    expect(r.cleanArgs).toEqual(['026', '1', '1000']);
    expect(r.sellerNote).toBe('Taze malzeme.');
  });

  it('falls back to trailing quoted note', () => {
    const r = extractSellerNoteFromArgs(['owl', 'A1', '19000', '"İlk', 'T8', 'baykuşumdu."']);
    expect(r.cleanArgs).toEqual(['owl', 'A1', '19000']);
    expect(r.sellerNote).toBe('İlk T8 baykuşumdu.');
  });
});

describe('validateMarketSellerNote', () => {
  it('rejects mentions', () => {
    expect(() => validateMarketSellerNote('@everyone merhaba')).toThrow();
  });

  it('accepts short note', () => {
    expect(validateMarketSellerNote('İlk av baykuşumdu.')).toBe('İlk av baykuşumdu.');
  });
});
