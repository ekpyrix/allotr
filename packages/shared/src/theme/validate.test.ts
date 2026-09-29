import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { darkTheme, lightTheme } from './builtin.ts';
import { composite, contrastRatio } from './color.ts';
import { hexArb } from './testing.ts';
import {
  CONTRAST_MINIMUM,
  THEME_PAIRS,
  THEME_SCHEMES,
  THEME_TOKENS,
  themeTokensSchema,
  type ThemePair,
  type ThemeScheme,
  type ThemeToken,
  type ThemeTokens,
} from './tokens.ts';
import { pairRatio, themePairs, validateTheme } from './validate.ts';

const themeArb: fc.Arbitrary<ThemeTokens> = fc.record(
  Object.fromEntries(THEME_TOKENS.map((token) => [token, hexArb])) as Record<
    ThemeToken,
    fc.Arbitrary<string>
  >,
);

const schemeArb: fc.Arbitrary<ThemeScheme> = fc.constantFrom(...THEME_SCHEMES);

// Random themes almost never pass; a built-in with one token replaced
// often does, so the "accepted means AA" property sees many accepted themes.
const nearBuiltinArb: fc.Arbitrary<[ThemeTokens, ThemeScheme]> = fc
  .tuple(
    fc.constantFrom(
      ['light', lightTheme] as const,
      ['dark', darkTheme] as const,
    ),
    fc.constantFrom(...THEME_TOKENS),
    hexArb,
  )
  .map(([[scheme, base], token, colour]) => [
    { ...base, [token]: colour },
    scheme,
  ]);

// Independent of validate.ts: the surface is recomputed here.
function ratio(theme: ThemeTokens, pair: ThemePair): number {
  const surface =
    pair.tint === undefined
      ? theme[pair.background]
      : composite(
          theme[pair.tint.token],
          pair.tint.alpha,
          theme[pair.background],
        );
  return contrastRatio(theme[pair.foreground], surface);
}

function failingPairs(theme: ThemeTokens, scheme: ThemeScheme) {
  return THEME_PAIRS.filter(
    (pair) =>
      (pair.scheme ?? scheme) === scheme &&
      ratio(theme, pair) < CONTRAST_MINIMUM[pair.kind],
  );
}

describe('built-in themes', () => {
  it.each([
    ['light', lightTheme],
    ['dark', darkTheme],
  ] as const)('%s passes AA', (scheme, theme) => {
    expect(validateTheme(theme, scheme)).toEqual([]);
    expect(themeTokensSchema.safeParse(theme).success).toBe(true);
  });
});

describe('themePairs', () => {
  it('adds the destructive button fills for the dark scheme only', () => {
    const tinted = (scheme: ThemeScheme) =>
      themePairs(scheme).filter((pair) => pair.tint !== undefined);
    expect(tinted('light')).toEqual([]);
    expect(tinted('dark')).toEqual([
      {
        foreground: 'destructive',
        background: 'background',
        tint: { token: 'input', alpha: 0.3 },
        scheme: 'dark',
        kind: 'text',
      },
      {
        foreground: 'destructive',
        background: 'background',
        tint: { token: 'input', alpha: 0.5 },
        scheme: 'dark',
        kind: 'text',
      },
    ]);
  });

  it('keeps every unscoped pair for both schemes', () => {
    const unscoped = THEME_PAIRS.filter((pair) => pair.scheme === undefined);
    for (const scheme of THEME_SCHEMES)
      expect(themePairs(scheme)).toEqual(expect.arrayContaining(unscoped));
  });
});

describe('validateTheme', () => {
  it('reports the destructive button fill that the old dark colour failed', () => {
    // The dark destructive before #89: 4.50:1 at rest, 3.40:1 on hover.
    const failures = validateTheme(
      { ...darkTheme, destructive: '#d98270' },
      'dark',
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      foreground: 'destructive',
      tint: { token: 'input', alpha: 0.5 },
      required: 4.5,
    });
    expect(failures[0]?.ratio).toBeCloseTo(3.4, 1);
  });

  it('does not hold a light theme to the dark button fills', () => {
    // Allotr light fails on input 50% over background, a fill that light
    // buttons never show.
    expect(
      pairRatio(lightTheme, {
        foreground: 'destructive',
        background: 'background',
        tint: { token: 'input', alpha: 0.5 },
        kind: 'text',
      }),
    ).toBeLessThan(4.5);
    expect(validateTheme(lightTheme, 'light')).toEqual([]);
  });

  it('reports a failing pair with its ratio and minimum', () => {
    const failures = validateTheme({ ...lightTheme, ring: '#e3eae4' }, 'light');
    expect(failures).toContainEqual({
      foreground: 'ring',
      background: 'plot',
      kind: 'non-text',
      ratio: 1,
      required: 3,
    });
  });

  it('flags exactly the pairs below their minimum', () => {
    fc.assert(
      fc.property(themeArb, schemeArb, (theme, scheme) => {
        expect(validateTheme(theme, scheme)).toEqual(
          failingPairs(theme, scheme).map((pair) => ({
            ...pair,
            ratio: ratio(theme, pair),
            required: CONTRAST_MINIMUM[pair.kind],
          })),
        );
      }),
    );
  });

  it('accepts a theme only when every declared pair meets AA', () => {
    fc.assert(
      fc.property(nearBuiltinArb, ([theme, scheme]) => {
        fc.pre(validateTheme(theme, scheme).length === 0);
        for (const pair of themePairs(scheme)) {
          expect(ratio(theme, pair)).toBeGreaterThanOrEqual(
            CONTRAST_MINIMUM[pair.kind],
          );
        }
      }),
    );
  });
});

describe('themeTokensSchema', () => {
  it('requires every token', () => {
    const missing: Partial<Record<ThemeToken, string>> = { ...lightTheme };
    delete missing.ring;
    expect(themeTokensSchema.safeParse(missing).success).toBe(false);
  });

  it('rejects alpha colours and unknown tokens', () => {
    expect(
      themeTokensSchema.safeParse({ ...lightTheme, plot: '#e3eae480' }).success,
    ).toBe(false);
    expect(
      themeTokensSchema.safeParse({ ...lightTheme, sparkle: '#ffffff' })
        .success,
    ).toBe(false);
  });
});
