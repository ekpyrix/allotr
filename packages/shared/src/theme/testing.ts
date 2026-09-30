import fc from 'fast-check';
import { contrastRatio } from './color.ts';
import { fromOklch } from './oklch.ts';
import { completePalette, type Palette } from './palette.ts';
import type { ThemeScheme } from './tokens.ts';

// Test-only arbitraries and fixtures for theme tests.

/** Any opaque colour as #rrggbb. */
export const hexArb: fc.Arbitrary<string> = fc
  .tuple(fc.nat(255), fc.nat(255), fc.nat(255))
  .map((rgb) => `#${rgb.map((n) => n.toString(16).padStart(2, '0')).join('')}`);

// Made-up palettes for resolver tests. "Fixture Dawn" is light and shares
// the weak spots of typical light terminal palettes: an orange near 2.6:1
// and a green near 3:1 on the page. "Fixture Dusk" is its dark partner.

export const fixtureDawn: Palette = {
  neutrals: {
    crust: '#dedce8',
    mantle: '#e8e7ef',
    base: '#f1f0f5',
    surface0: '#cfccdb',
    surface1: '#bfbccd',
    surface2: '#afacbf',
    overlay0: '#9f9cb1',
    overlay1: '#8f8ca3',
    overlay2: '#7f7c95',
    subtext0: '#6f6c87',
    subtext1: '#5f5c79',
    text: '#4f4c6b',
  },
  accents: {
    rose: '#d6204a',
    ember: '#f2600f',
    gold: '#d98f22',
    fern: '#459a33',
    lagoon: '#1a9199',
    azure: '#2266f0',
    violet: '#8a3bea',
    blossom: '#e874c8',
    iris: '#7688fa',
  },
  hues: {
    red: 'rose',
    orange: 'ember',
    yellow: 'gold',
    green: 'fern',
    cyan: 'lagoon',
    blue: 'azure',
    purple: 'violet',
    pink: 'blossom',
  },
};

export const fixtureDusk: Palette = {
  neutrals: {
    crust: '#13111e',
    mantle: '#191726',
    base: '#1f1d2e',
    surface0: '#2f2c42',
    surface1: '#3b3852',
    surface2: '#48445f',
    overlay0: '#5a5672',
    overlay1: '#6d6985',
    overlay2: '#807c98',
    subtext0: '#a8a4c0',
    subtext1: '#bdb9d4',
    text: '#d2cfe8',
  },
  accents: {
    rose: '#f28ba6',
    maroon: '#eaa0ae',
    ember: '#f9ad83',
    gold: '#f5dca2',
    fern: '#a8dc9c',
    lagoon: '#93dccc',
    azure: '#8cb2f6',
    violet: '#c9a4f5',
    blossom: '#f3c2e2',
    lavender: '#b7bdfb',
  },
  hues: {
    red: 'rose',
    orange: 'ember',
    yellow: 'gold',
    green: 'fern',
    cyan: 'lagoon',
    blue: 'azure',
    purple: 'violet',
    pink: 'blossom',
  },
};

const unit = fc.double({ min: 0, max: 1, noNaN: true });

/**
 * A palette someone could plausibly ship: page and text at least 7:1
 * apart, the rest of the ramp derived, and accents at mid lightness for
 * the scheme with moderate chroma.
 */
export function arbitraryPalette(scheme: ThemeScheme): fc.Arbitrary<Palette> {
  const light = scheme === 'light';
  const tone = (low: number, high: number) =>
    fc.tuple(unit, unit, unit).map(([l, c, h]) =>
      fromOklch({
        l: low + l * (high - low),
        c: c * 0.06,
        h: h * 2 * Math.PI,
      }),
    );
  const accent = fc.tuple(unit, unit, unit).map(([l, c, h]) =>
    fromOklch({
      l: light ? 0.45 + l * 0.25 : 0.65 + l * 0.2,
      c: 0.05 + c * 0.15,
      h: h * 2 * Math.PI,
    }),
  );
  return fc
    .record({
      base: light ? tone(0.9, 1) : tone(0.12, 0.3),
      text: light ? tone(0.15, 0.45) : tone(0.85, 1),
      accents: fc.array(accent, { minLength: 0, maxLength: 12 }),
    })
    .filter(({ base, text }) => contrastRatio(base, text) >= 7)
    .map(({ base, text, accents }) =>
      completePalette(
        {
          neutrals: { base, text },
          accents: Object.fromEntries(
            accents.map((hex, at) => [`accent-${String(at)}`, hex]),
          ),
          hues: {},
        },
        scheme,
      ),
    );
}
