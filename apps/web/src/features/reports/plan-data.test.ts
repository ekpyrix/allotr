import { describe, expect, it } from 'vitest';
import { formatRate } from './plan-data.ts';

describe('formatRate', () => {
  it('writes hundredths of a percent as text', () => {
    expect(formatRate(1500)).toBe('15%');
    expect(formatRate(1550)).toBe('15.5%');
    expect(formatRate(5)).toBe('0.05%');
    expect(formatRate(-500)).toBe('-5%');
    expect(formatRate(0)).toBe('0%');
  });
});
