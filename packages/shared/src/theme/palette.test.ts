import { describe, expect, it } from 'vitest';
import { toOklch } from './oklch.ts';
import {
  CANONICAL_HUES,
  completePalette,
  NEUTRAL_SLOTS,
  paletteSchema,
  partialPaletteSchema,
  slotColor,
  type PartialPalette,
} from './palette.ts';
import { fixtureDawn, fixtureDusk } from './testing.ts';
import type { ThemeScheme } from './tokens.ts';

describe('paletteSchema', () => {
  it('accepts a complete palette', () => {
    expect(paletteSchema.safeParse(fixtureDawn).success).toBe(true);
  });

  it('rejects a missing neutral', () => {
    const neutrals = Object.fromEntries(
      Object.entries(fixtureDawn.neutrals).filter(
        ([slot]) => slot !== 'mantle',
      ),
    );
    expect(paletteSchema.safeParse({ ...fixtureDawn, neutrals }).success).toBe(
      false,
    );
  });

  it('rejects an accent name with other characters', () => {
    const accents = { ...fixtureDawn.accents, 'Red!': '#ff0000' };
    expect(paletteSchema.safeParse({ ...fixtureDawn, accents }).success).toBe(
      false,
    );
  });

  it('rejects an accent named after a neutral slot', () => {
    const accents = { ...fixtureDawn.accents, base: '#ff0000' };
    expect(paletteSchema.safeParse({ ...fixtureDawn, accents }).success).toBe(
      false,
    );
  });

  it('rejects more than 24 accents', () => {
    const accents = Object.fromEntries(
      Array.from({ length: 25 }, (_, at) => [`a${String(at)}`, '#123456']),
    );
    const hues = Object.fromEntries(CANONICAL_HUES.map((hue) => [hue, 'a0']));
    expect(
      paletteSchema.safeParse({ ...fixtureDawn, accents, hues }).success,
    ).toBe(false);
  });

  it('points a hue at a missing accent', () => {
    const parsed = paletteSchema.safeParse({
      ...fixtureDawn,
      hues: { ...fixtureDawn.hues, red: 'crimson' },
    });
    expect(parsed.error?.issues.map((issue) => issue.path)).toEqual([
      ['hues', 'red'],
    ]);
  });
});

const sparse: PartialPalette = {
  neutrals: { base: '#f4f2ee', text: '#2d2a33' },
  accents: { red: '#c4323f', green: '#2f7d3a', blue: '#2a5bd7' },
  hues: {},
};

describe('completePalette', () => {
  it('accepts what partialPaletteSchema accepts', () => {
    expect(partialPaletteSchema.safeParse(sparse).success).toBe(true);
  });

  it.each<ThemeScheme>(['light', 'dark'])(
    'gives a complete palette in the %s scheme',
    (scheme) => {
      const palette = completePalette(sparse, scheme);
      expect(paletteSchema.safeParse(palette).success).toBe(true);
      expect(Object.keys(palette.neutrals)).toEqual([...NEUTRAL_SLOTS]);
    },
  );

  it('uses accents named after a hue and generates the rest', () => {
    const palette = completePalette(sparse, 'light');
    expect(palette.hues).toEqual({
      red: 'red',
      orange: 'orange',
      yellow: 'yellow',
      green: 'green',
      cyan: 'cyan',
      blue: 'blue',
      purple: 'purple',
      pink: 'pink',
    });
    expect(palette.accents.red).toBe('#c4323f');
    for (const hue of ['orange', 'yellow', 'cyan', 'purple', 'pink']) {
      expect(palette.accents[hue]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('generates hues at the median lightness of the given accents', () => {
    const palette = completePalette(sparse, 'light');
    const given = ['#c4323f', '#2f7d3a', '#2a5bd7'].map(
      (hex) => toOklch(hex).l,
    );
    const median = [...given].sort((a, b) => a - b)[1] ?? 0;
    expect(toOklch(palette.accents.purple ?? '').l).toBeCloseTo(median, 2);
  });

  it('keeps a given hue index and given neutrals', () => {
    const palette = completePalette(
      {
        neutrals: { base: '#101010', text: '#f0f0f0', surface0: '#222222' },
        accents: { ember: '#ff8800' },
        hues: { orange: 'ember' },
      },
      'dark',
    );
    expect(palette.hues.orange).toBe('ember');
    expect(palette.neutrals.surface0).toBe('#222222');
  });

  it('comes back unchanged for a complete palette', () => {
    expect(completePalette(fixtureDawn, 'light')).toEqual(fixtureDawn);
    expect(completePalette(fixtureDusk, 'dark')).toEqual(fixtureDusk);
  });

  it.each<[ThemeScheme, string, string]>([
    ['light', '#f4f2ee', '#2d2a33'],
    ['dark', '#1c1b22', '#e8e4f0'],
  ])('derives the ramp in the %s scheme', (scheme, base, text) => {
    const { neutrals } = completePalette(
      { neutrals: { base, text }, accents: {}, hues: {} },
      scheme,
    );
    const baseL = toOklch(base).l;
    // mantle and crust are always darker than the page, in both schemes.
    expect(toOklch(neutrals.mantle).l).toBeCloseTo(baseL - 0.03, 2);
    expect(toOklch(neutrals.crust).l).toBeCloseTo(baseL - 0.06, 2);
    // From base to text, lightness moves one way only.
    const ramp = NEUTRAL_SLOTS.slice(2).map(
      (slot) => toOklch(neutrals[slot]).l,
    );
    const steps = ramp.slice(1).map((l, at) => l - (ramp[at] ?? 0));
    const sign = Math.sign(toOklch(text).l - baseL);
    for (const step of steps) expect(Math.sign(step)).toBe(sign);
    expect(toOklch(neutrals.surface0).l).toBeCloseTo(
      baseL + (toOklch(text).l - baseL) * 0.1,
      2,
    );
  });

  it('generates accents with no accents given', () => {
    const palette = completePalette(
      { neutrals: { base: '#ffffff', text: '#000000' }, accents: {}, hues: {} },
      'light',
    );
    expect(Object.keys(palette.accents)).toEqual([...CANONICAL_HUES]);
    expect(toOklch(palette.accents.blue ?? '').l).toBeCloseTo(0.55, 2);
  });
});

describe('slotColor', () => {
  it('finds neutrals, hues and accents by name', () => {
    expect(slotColor(fixtureDawn, 'base')).toBe('#f1f0f5');
    expect(slotColor(fixtureDawn, 'purple')).toBe('#8a3bea');
    expect(slotColor(fixtureDawn, 'iris')).toBe('#7688fa');
  });

  it('gives undefined for an unknown name, even an Object key', () => {
    expect(slotColor(fixtureDawn, 'maroon')).toBeUndefined();
    expect(slotColor(fixtureDawn, 'constructor')).toBeUndefined();
  });
});
