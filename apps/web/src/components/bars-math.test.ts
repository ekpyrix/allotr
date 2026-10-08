import { describe, expect, it } from 'vitest';
import { clampFraction, percent } from './bars-math.ts';

describe('clampFraction', () => {
  it.each([
    [Number.NaN, 0],
    [-0.5, 0],
    [0, 0],
    [0.25, 0.25],
    [1, 1],
    [3, 1],
    [Infinity, 1],
    [-Infinity, 0],
  ])('%s → %s', (input, expected) => {
    expect(clampFraction(input)).toBe(expected);
  });
});

describe('percent', () => {
  it('writes exact widths', () => {
    expect(percent(0.5)).toBe('50%');
    expect(percent(1 / 3)).toBe('33.33%');
    expect(percent(2)).toBe('100%');
  });
});
