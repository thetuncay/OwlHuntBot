import { describe, expect, it } from 'vitest';
import {
  normalizeForNameSearch,
  normalizeForNameSearchCompact,
} from '../utils/name-search-normalize';

describe('normalizeForNameSearch', () => {
  it('folds mathematical italic/bold letters', () => {
    expect(normalizeForNameSearch('𝐾𝑖𝑓𝑜𝑧')).toBe('kifoz');
    expect(normalizeForNameSearchCompact('𝐾𝑖𝑓𝑜𝑧')).toBe('kifoz');
  });

  it('folds Turkish characters and case', () => {
    expect(normalizeForNameSearch('KUBAT 30 ŞUBAT')).toBe('kubat 30 subat');
  });

  it('matches query against stylized display name', () => {
    const display = normalizeForNameSearch('𝐾𝑖𝑓𝑜𝑧');
    const query = normalizeForNameSearch('kifoz');
    expect(display).toBe(query);
  });
});

describe('partial name search', () => {
  it('allows partial name search for long display names', () => {
    const display = normalizeForNameSearch('KUBAT 30 ŞUBAT');
    const query = normalizeForNameSearch('kubat');
    expect(display.startsWith(query)).toBe(true);
  });
});
