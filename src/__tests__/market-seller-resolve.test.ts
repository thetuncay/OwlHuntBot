import { describe, expect, it } from 'vitest';
import { normalizeForNameSearch } from '../utils/name-search-normalize';

function scoreNameMatch(queryNorm: string, candidateNorm: string): number {
  const queryCompact = queryNorm.replace(/\s/g, '');
  const candidateCompact = candidateNorm.replace(/\s/g, '');
  if (queryNorm === candidateNorm || queryCompact === candidateCompact) return 100;
  if (candidateNorm.startsWith(queryNorm) || candidateCompact.startsWith(queryCompact)) return 85;
  if (candidateNorm.includes(queryNorm) || candidateCompact.includes(queryCompact)) return 70;
  return 0;
}

describe('market seller name matching', () => {
  it('matches stylized Kifoz with plain kifoz', () => {
    const display = normalizeForNameSearch('𝐾𝑖𝑓𝑜𝑧');
    const query = normalizeForNameSearch('kifoz');
    expect(scoreNameMatch(query, display)).toBeGreaterThanOrEqual(70);
  });

  it('matches partial kubat against long display name', () => {
    const display = normalizeForNameSearch('KUBAT 30 ŞUBAT');
    const query = normalizeForNameSearch('kubat');
    expect(scoreNameMatch(query, display)).toBeGreaterThanOrEqual(85);
  });

  it('does not match unrelated names', () => {
    const display = normalizeForNameSearch('Tuncay');
    const query = normalizeForNameSearch('kifoz');
    expect(scoreNameMatch(query, display)).toBe(0);
  });
});
