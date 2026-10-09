import { describe, expect, it } from 'vitest';
import { barFraction } from './summary-math.ts';

describe('barFraction', () => {
  it('is the share of the whole', () => {
    expect(barFraction(2500, 10000)).toBe(0.25);
  });
  it('is empty when nothing is left or there is no allowance', () => {
    expect(barFraction(0, 10000)).toBe(0);
    expect(barFraction(-300, 10000)).toBe(0);
    expect(barFraction(500, 0)).toBe(0);
  });
  it('never passes full', () => {
    expect(barFraction(12000, 10000)).toBe(1);
  });
});
