import { describe, expect, it } from 'vitest';
import { darkTheme, lightTheme } from './builtin.ts';
import { contrastRatio } from './color.ts';
import {
  convertV1,
  DEFAULT_PALETTE_THEME_ID,
  findPaletteTheme,
  PALETTE_THEMES,
  paletteTheme,
  readThemeFile,
  slotPaletteTheme,
  THEME_FAMILIES,
  toThemeFileV2,
  toV2,
} from './palette-themes.ts';
import { resolveTheme } from './resolve.ts';
import { ROLE_SPECS, type Role } from './roles.ts';
import { fixtureDawn } from './testing.ts';
import { findTheme, SHIPPED_THEMES, toThemeFile } from './themes.ts';
import type { ThemeToken } from './tokens.ts';

// Roles that stand for one v1 token each.
const ONE_TO_ONE: readonly (readonly [Role, ThemeToken])[] = [
  ['canvas', 'background'],
  ['text', 'foreground'],
  ['text-muted', 'muted-foreground'],
  ['card', 'plot'],
  ['card-raised', 'muted'],
  ['hero-ok', 'today'],
  ['hero-over', 'over'],
  ['primary', 'primary'],
  ['on-primary', 'primary-foreground'],
  ['ring', 'ring'],
  ['positive', 'positive'],
  ['negative', 'negative'],
  ['danger', 'destructive'],
  ['outline', 'input'],
  ['outline-variant', 'border'],
];

describe('convertV1', () => {
  it.each(SHIPPED_THEMES.map((theme) => [theme.id, theme] as const))(
    'keeps the look of %s',
    (_id, theme) => {
      const { palette, roles } = convertV1(theme.tokens, theme.scheme);
      const resolved = resolveTheme({ scheme: theme.scheme, palette, roles });
      expect(resolved.failures).toEqual([]);
      for (const [role, token] of ONE_TO_ONE) {
        // A role v1 never checked where it now sits may be fitted, but
        // only from the old colour.
        const fit = resolved.fitted[role];
        expect(fit?.from ?? resolved.roles[role], role).toBe(
          theme.tokens[token],
        );
      }
    },
  );

  it('fits only what v1 never checked', () => {
    const fitted = Object.fromEntries(
      SHIPPED_THEMES.map((theme) => {
        const { palette, roles } = convertV1(theme.tokens, theme.scheme);
        const resolved = resolveTheme({ scheme: theme.scheme, palette, roles });
        return [theme.id, Object.keys(resolved.fitted)];
      }),
    );
    expect(fitted).toMatchSnapshot();
  });
});

describe('shipped palette themes', () => {
  it('has unique ids and names', () => {
    const ids = PALETTE_THEMES.map((theme) => theme.id);
    const names = PALETTE_THEMES.map((theme) => theme.name.toLowerCase());
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it('credits every third-party family', () => {
    for (const family of THEME_FAMILIES) {
      const ours = ['allotr-classic', 'high-contrast', 'paper', 'harbour'];
      if (ours.includes(family.id)) expect(family.credit).toBeUndefined();
      else expect(family.credit, family.id).toBeDefined();
    }
  });

  it('lists each family with light flavours first', () => {
    for (const family of THEME_FAMILIES) {
      const schemes = family.themes.map(
        (id) => findPaletteTheme(id, [])?.scheme,
      );
      const firstDark = schemes.indexOf('dark');
      if (firstDark >= 0)
        expect(schemes.slice(firstDark), family.id).not.toContain('light');
    }
  });

  it('keeps high contrast at 7:1 for text on the page surfaces', () => {
    for (const id of ['high-contrast-light', 'high-contrast-dark']) {
      const theme = findPaletteTheme(id, []);
      if (theme === undefined) throw new Error(id);
      const { roles } = theme.resolved;
      for (const surface of ['canvas', 'card', 'card-raised'] as const) {
        expect(
          contrastRatio(roles.text, roles[surface]),
          `${id} text on ${surface}`,
        ).toBeGreaterThanOrEqual(7);
      }
    }
  });
});

describe('theme ids', () => {
  it('reads the earlier built-in ids as Allotr Classic', () => {
    expect(findPaletteTheme('light', [])?.id).toBe('allotr-classic-light');
    expect(findPaletteTheme('dark', [])?.id).toBe('allotr-classic-dark');
    expect(findPaletteTheme('light', [])?.resolved.roles.canvas).toBe(
      lightTheme.background,
    );
    expect(findPaletteTheme('dark', [])?.resolved.roles.canvas).toBe(
      darkTheme.background,
    );
  });

  it('keeps the community theme ids', () => {
    for (const id of ['high-contrast-light', 'paper', 'harbour']) {
      expect(findPaletteTheme(id, [])?.id).toBe(id);
    }
  });

  it('starts each slot on Catppuccin', () => {
    expect(DEFAULT_PALETTE_THEME_ID).toEqual({
      light: 'catppuccin-latte',
      dark: 'catppuccin-mocha',
    });
    expect(slotPaletteTheme('no-such-theme', 'dark', []).id).toBe(
      'catppuccin-mocha',
    );
    expect(slotPaletteTheme('catppuccin-mocha', 'light', []).id).toBe(
      'catppuccin-latte',
    );
  });

  it('finds a custom theme', () => {
    const custom = paletteTheme(
      'c0ffee',
      toThemeFileV2({ name: 'Dawn', scheme: 'light', palette: fixtureDawn }),
    );
    expect(slotPaletteTheme('c0ffee', 'light', [custom])).toBe(custom);
  });
});

describe('readThemeFile', () => {
  it('reads a v1 file as v2', () => {
    const v1 = findTheme('paper', []);
    if (v1 === undefined) throw new Error('paper');
    const read = readThemeFile(toThemeFile(v1));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.theme.version).toBe(2);
    expect(paletteTheme('x', read.theme).resolved.roles.canvas).toBe(
      v1.tokens.background,
    );
  });

  it('reads a v2 file and completes its palette', () => {
    const read = readThemeFile({
      format: 'allotr-theme',
      version: 2,
      name: 'Sparse',
      scheme: 'dark',
      palette: {
        neutrals: { base: '#15151c', text: '#e6e6f0' },
        accents: { violet: '#b39cf2' },
        hues: { purple: 'violet' },
      },
    });
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(Object.keys(read.theme.palette.neutrals)).toHaveLength(12);
    expect(read.theme.palette.hues.purple).toBe('violet');
  });

  it('points a failing role it sets at /roles', () => {
    const read = readThemeFile(
      toThemeFileV2({
        name: 'Exact',
        scheme: 'light',
        palette: fixtureDawn,
        roles: { 'hero-tight': { slot: 'orange', fit: 'off' } },
      }),
    );
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.problems.map((problem) => problem.path)).toEqual([
      '/roles/hero-tight',
    ]);
    expect(read.problems[0]?.message).toMatch(
      /^hero-tight on card: .*needs 3:1$/,
    );
  });

  it('points an unknown slot at /roles too', () => {
    const read = readThemeFile(
      toThemeFileV2({
        name: 'Typo',
        scheme: 'light',
        palette: fixtureDawn,
        roles: { ring: { slot: 'purpel' } },
      }),
    );
    expect(read.ok || read.problems.map((p) => p.path)).toEqual([
      '/roles/ring',
    ]);
  });

  it('refuses an unknown version', () => {
    expect(
      readThemeFile({ format: 'allotr-theme', version: 3, name: 'Later' }),
    ).toEqual({
      ok: false,
      problems: [{ path: '/version', message: 'Use version 1 or 2' }],
    });
  });

  it('reports schema problems as pointers', () => {
    const read = readThemeFile({
      format: 'allotr-theme',
      version: 2,
      name: 'Broken',
      scheme: 'dusk',
      palette: { neutrals: { base: '#fff' }, accents: {}, hues: {} },
    });
    expect(read.ok || read.problems.map((p) => p.path).sort()).toEqual([
      '/palette/neutrals/text',
      '/scheme',
    ]);
  });

  it('writes what it reads', () => {
    for (const theme of PALETTE_THEMES) {
      const file = toThemeFileV2(theme);
      expect(readThemeFile(file), theme.id).toEqual({ ok: true, theme: file });
    }
  });
});

describe('toV2', () => {
  it('converts every v1 shipped theme without a failure', () => {
    for (const theme of SHIPPED_THEMES) {
      const file = toV2(toThemeFile(theme));
      expect(paletteTheme(theme.id, file).resolved.failures).toEqual([]);
    }
  });
});

describe('role kinds', () => {
  it('never fits a surface', () => {
    for (const theme of PALETTE_THEMES) {
      for (const role of Object.keys(theme.resolved.fitted) as Role[]) {
        expect(ROLE_SPECS[role].kind, `${theme.id} ${role}`).not.toBe(
          'surface',
        );
      }
    }
  });
});
