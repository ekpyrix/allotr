import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { darkTheme, lightTheme } from './builtin.ts';
import { contrastRatio } from './color.ts';
import { hexArb } from './testing.ts';
import {
  describeContrastFailure,
  findTheme,
  parseThemeFile,
  SHIPPED_THEMES,
  slotTheme,
  themeFileSchema,
  toThemeFile,
  type NamedTheme,
} from './themes.ts';
import { THEME_TOKENS } from './tokens.ts';
import { themePairs, validateTheme } from './validate.ts';

describe('shipped themes', () => {
  it.each(SHIPPED_THEMES.map((theme) => [theme.id, theme] as const))(
    '%s passes AA',
    (_id, theme) => {
      expect(validateTheme(theme.tokens, theme.scheme)).toEqual([]);
      expect(parseThemeFile(toThemeFile(theme))).toMatchObject({ ok: true });
    },
  );

  // Tinted button fills are held to AA only: 7:1 on a mid-grey fill would
  // leave destructive text nearly white.
  it.each(['high-contrast-light', 'high-contrast-dark'])(
    '%s meets 7:1 on every text pair on an opaque surface',
    (id) => {
      const theme = findTheme(id, []);
      expect(theme).toBeDefined();
      if (theme === undefined) return;
      const pairs = themePairs(theme.scheme).filter(
        (p) => p.kind === 'text' && p.tint === undefined,
      );
      for (const pair of pairs) {
        expect(
          contrastRatio(
            theme.tokens[pair.foreground],
            theme.tokens[pair.background],
          ),
          `${pair.foreground} on ${pair.background}`,
        ).toBeGreaterThanOrEqual(7);
      }
    },
  );

  it('has unique ids and names', () => {
    const ids = SHIPPED_THEMES.map((theme) => theme.id);
    const names = SHIPPED_THEMES.map((theme) => theme.name.toLowerCase());
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('parseThemeFile', () => {
  const valid = toThemeFile({
    name: 'Mint',
    scheme: 'light',
    tokens: lightTheme,
  });

  it('accepts a valid file', () => {
    expect(parseThemeFile(valid)).toEqual({ ok: true, theme: valid });
  });

  it('checks a dark file against the destructive button fills', () => {
    const parsed = parseThemeFile(
      toThemeFile({
        name: 'Ember',
        scheme: 'dark',
        tokens: { ...darkTheme, destructive: '#d98270' },
      }),
    );
    expect(parsed).toEqual({
      ok: false,
      problems: [
        {
          path: '/tokens/destructive',
          message:
            'destructive on input 50% over background: 3.40:1, needs 4.5:1',
        },
      ],
    });
  });

  it('rejects a theme with a failing pair and lists the pair', () => {
    const parsed = parseThemeFile({
      ...valid,
      tokens: { ...lightTheme, ring: '#e3eae4' },
    });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.problems).toEqual([
      {
        path: '/tokens/ring',
        message: 'ring on background: 1.11:1, needs 3:1',
      },
      { path: '/tokens/ring', message: 'ring on plot: 1.00:1, needs 3:1' },
    ]);
  });

  it('lists exactly the failing pairs', () => {
    fc.assert(
      fc.property(fc.constantFrom(...THEME_TOKENS), hexArb, (token, colour) => {
        const tokens = { ...lightTheme, [token]: colour };
        const parsed = parseThemeFile({ ...valid, tokens });
        const failures = validateTheme(tokens, 'light');
        if (failures.length === 0) expect(parsed.ok).toBe(true);
        else
          expect(parsed).toEqual({
            ok: false,
            problems: failures.map((failure) => ({
              path: `/tokens/${failure.foreground}`,
              message: describeContrastFailure(failure),
            })),
          });
      }),
    );
  });

  it.each([
    ['another format', { ...valid, format: 'other' }, '/format'],
    ['a later version', { ...valid, version: 2 }, '/version'],
    [
      'a missing token',
      { ...valid, tokens: { background: '#fff' } },
      '/tokens/foreground',
    ],
    [
      'a bad colour',
      { ...valid, tokens: { ...lightTheme, ring: 'gold' } },
      '/tokens/ring',
    ],
    ['a blank name', { ...valid, name: '  ' }, '/name'],
    ['an unknown scheme', { ...valid, scheme: 'dim' }, '/scheme'],
  ])('rejects %s', (_label, file, path) => {
    const parsed = parseThemeFile(file);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.problems.map((problem) => problem.path)).toContain(path);
  });

  it('round-trips through toThemeFile', () => {
    expect(themeFileSchema.parse(JSON.parse(JSON.stringify(valid)))).toEqual(
      valid,
    );
  });
});

describe('describeContrastFailure', () => {
  it('names a tinted surface', () => {
    expect(
      describeContrastFailure({
        foreground: 'destructive',
        background: 'background',
        tint: { token: 'input', alpha: 0.5 },
        scheme: 'dark',
        kind: 'text',
        ratio: 3.406,
        required: 4.5,
      }),
    ).toBe('destructive on input 50% over background: 3.40:1, needs 4.5:1');
  });

  it('never rounds a failing ratio up to the minimum', () => {
    expect(
      describeContrastFailure({
        foreground: 'input',
        background: 'background',
        kind: 'non-text',
        ratio: 2.999,
        required: 3,
      }),
    ).toBe('input on background: 2.99:1, needs 3:1');
  });
});

describe('slotTheme', () => {
  const custom: NamedTheme = {
    id: 'c1',
    name: 'Mine',
    scheme: 'dark',
    tokens: darkTheme,
  };

  it('finds shipped and custom themes', () => {
    expect(slotTheme('paper', 'light', []).name).toBe('Paper');
    expect(slotTheme('c1', 'dark', [custom])).toBe(custom);
  });

  it('falls back to the default for an unknown id or the wrong scheme', () => {
    expect(slotTheme('gone', 'dark', []).id).toBe('dark');
    expect(slotTheme('c1', 'light', [custom]).id).toBe('light');
    expect(slotTheme('harbour', 'light', []).id).toBe('light');
  });
});
