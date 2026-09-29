import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { channels } from './color.ts';
import { fromOklch, mixOklch, toOklch } from './oklch.ts';
import { hexArb } from './testing.ts';

describe('toOklch', () => {
  it('puts white at L 1 and black at L 0, both without chroma', () => {
    const white = toOklch('#ffffff');
    const black = toOklch('#000000');
    expect(white.l).toBeCloseTo(1, 4);
    expect(white.c).toBeCloseTo(0, 4);
    expect(black.l).toBeCloseTo(0, 4);
    expect(black.c).toBeCloseTo(0, 4);
  });

  it('expands shorthand', () => {
    expect(toOklch('#f80')).toEqual(toOklch('#ff8800'));
  });
});

describe('fromOklch', () => {
  it('round-trips every sRGB colour to within one step per channel', () => {
    fc.assert(
      fc.property(hexArb, (hex) => {
        const back = channels(fromOklch(toOklch(hex)));
        channels(hex).forEach((value, at) => {
          expect(Math.abs((back[at] ?? 0) - value) * 255).toBeLessThanOrEqual(
            1.0001,
          );
        });
      }),
      { numRuns: 200 },
    );
  });

  it('writes lower-case #rrggbb', () => {
    expect(fromOklch(toOklch('#A86F1C'))).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('reduces chroma to stay inside sRGB, keeping lightness', () => {
    const hex = fromOklch({ l: 0.9, c: 0.4, h: 2 });
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    const back = toOklch(hex);
    expect(back.c).toBeLessThan(0.4);
    expect(back.l).toBeCloseTo(0.9, 2);
  });

  it('clamps lightness', () => {
    expect(fromOklch({ l: 1.2, c: 0, h: 0 })).toBe('#ffffff');
    expect(fromOklch({ l: -0.1, c: 0, h: 0 })).toBe('#000000');
  });
});

describe('mixOklch', () => {
  it('returns the ends at 0 and 1', () => {
    fc.assert(
      fc.property(hexArb, hexArb, (a, b) => {
        expect(mixOklch(a, b, 0)).toBe(a);
        expect(mixOklch(a, b, 1)).toBe(b);
      }),
      { numRuns: 100 },
    );
  });

  it('moves lightness in a straight line', () => {
    const mid = toOklch(mixOklch('#000000', '#ffffff', 0.5));
    expect(mid.l).toBeCloseTo(0.5, 2);
  });

  it('keeps a grey end from swinging the hue', () => {
    const red = toOklch('#d20f39');
    const mid = toOklch(mixOklch('#808080', '#d20f39', 0.5));
    expect(Math.abs(mid.h - red.h)).toBeLessThan(0.05);
  });
});
