import { describe, expect, it } from 'vitest';
import { percentile } from '../utils/perf-metrics';

describe('perf-metrics percentile', () => {
  it('returns 0 for empty input', () => {
    expect(percentile([], 50)).toBe(0);
  });

  it('computes p50 and p95', () => {
    const values = [10, 20, 30, 40, 100];
    expect(percentile(values, 50)).toBe(30);
    expect(percentile(values, 95)).toBe(100);
  });
});
