import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { darkTheme, lightTheme } from './builtin.ts';
import { contrastRatio } from './color.ts';
import { hexArb } from './testing.ts';
import {
  CONTRAST_MINIMUM,
  THEME_PAIRS,
  THEME_TOKENS,
  themeTokensSchema,
  type ThemeToken,
  type ThemeTokens,
} from './tokens.ts';
import { validateTheme } from './validate.ts';

const themeArb: fc.Arbitrary<ThemeTokens> = fc.record(
  Object.fromEntries(THEME_TOKENS.map((token) => [token, hexArb])) as Record<
    ThemeToken,
    fc.Arbitrary<string>
  >,
);

// Random themes almost never pass; a built-in with one token replaced
// often does, so the "accepted means AA" property sees many accepted themes.
const nearBuiltinArb: fc.Arbitrary<ThemeTokens> = fc
  .tuple(
    fc.constantFrom(lightTheme, darkTheme),
    fc.constantFrom(...THEME_TOKENS),
    hexArb,
  )
  .map(([base, token, colour]) => ({ ...base, [token]: colour }));

function failingPairs(theme: ThemeTokens) {
  return THEME_PAIRS.filter(
    (pair) =>
      contrastRatio(theme[pair.foreground], theme[pair.background]) <
      CONTRAST_MINIMUM[pair.kind],
  );
}

describe('built-in themes', () => {
  it.each([
    ['light', lightTheme],
    ['dark', darkTheme],
  ])('%s passes AA', (_name, theme) => {
    expect(validateTheme(theme)).toEqual([]);
    expect(themeTokensSchema.safeParse(theme).success).toBe(true);
  });
});

describe('validateTheme', () => {
  it('reports a failing pair with its ratio and minimum', () => {
    const failures = validateTheme({ ...lightTheme, ring: '#e3eae4' });
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
      fc.property(themeArb, (theme) => {
        const flagged = validateTheme(theme).map(
          ({ foreground, background, kind }) => ({
            foreground,
            background,
            kind,
          }),
        );
        expect(flagged).toEqual(failingPairs(theme));
      }),
    );
  });

  it('accepts a theme only when every declared pair meets AA', () => {
    fc.assert(
      fc.property(nearBuiltinArb, (theme) => {
        fc.pre(validateTheme(theme).length === 0);
        for (const pair of THEME_PAIRS) {
          expect(
            contrastRatio(theme[pair.foreground], theme[pair.background]),
          ).toBeGreaterThanOrEqual(CONTRAST_MINIMUM[pair.kind]);
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
