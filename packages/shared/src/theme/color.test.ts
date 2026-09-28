import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { contrastRatio, hexColorSchema, relativeLuminance } from './color.ts';
import { hexArb } from './testing.ts';

describe('hexColorSchema', () => {
  it.each(['#fff', '#FFFFFF', '#0f1a17', '#A86F1C'])('accepts %s', (text) => {
    expect(hexColorSchema.safeParse(text).success).toBe(true);
  });

  it.each(['fff', '#ffff', '#ffffff80', '#ggg', 'red', 'rgb(0,0,0)', ''])(
    'rejects %j',
    (text) => {
      expect(hexColorSchema.safeParse(text).success).toBe(false);
    },
  );
});

describe('relativeLuminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 10);
  });

  it('expands shorthand', () => {
    expect(relativeLuminance('#abc')).toBe(relativeLuminance('#aabbcc'));
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for equal colours', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 10);
    expect(contrastRatio('#17302a', '#17302a')).toBe(1);
  });

  it('matches a known value', () => {
    // #767676 on white is the classic 4.54:1 grey.
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });

  it('is symmetric and within [1, 21]', () => {
    fc.assert(
      fc.property(hexArb, hexArb, (a, b) => {
        const ratio = contrastRatio(a, b);
        expect(ratio).toBe(contrastRatio(b, a));
        expect(ratio).toBeGreaterThanOrEqual(1);
        expect(ratio).toBeLessThanOrEqual(21 + 1e-9);
      }),
    );
  });
});
