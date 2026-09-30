import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Palette } from './palette.ts';
import { resolveTheme } from './resolve.ts';
import type { Role, RoleEntry } from './roles.ts';
import { arbitraryPalette } from './testing.ts';
import type { ThemeScheme } from './tokens.ts';

const SCHEMES: readonly ThemeScheme[] = ['light', 'dark'];

describe.each(SCHEMES)('resolveTheme properties (%s)', (scheme) => {
  const palettes = arbitraryPalette(scheme);

  it('resolves any well-formed palette with no failures', () => {
    fc.assert(
      fc.property(palettes, (palette) => {
        expect(resolveTheme({ scheme, palette }).failures).toEqual([]);
      }),
      { numRuns: 300 },
    );
  });

  it('is deterministic', () => {
    fc.assert(
      fc.property(palettes, (palette) => {
        expect(resolveTheme({ scheme, palette })).toEqual(
          resolveTheme({ scheme, palette }),
        );
      }),
      { numRuns: 300 },
    );
  });

  it('is idempotent: pinning the fitted colours needs no more fitting', () => {
    fc.assert(
      fc.property(palettes, (palette) => {
        const first = resolveTheme({ scheme, palette });
        const pinned = Object.entries(first.fitted).map(
          ([role, fit], at) => [role, `pinned-${String(at)}`, fit.to] as const,
        );
        const next: Palette = {
          ...palette,
          accents: {
            ...palette.accents,
            ...Object.fromEntries(pinned.map(([, name, hex]) => [name, hex])),
          },
        };
        const roles: Partial<Record<Role, RoleEntry>> = Object.fromEntries(
          pinned.map(([role, name]) => [role, { slot: name, fit: 'off' }]),
        );
        const second = resolveTheme({ scheme, palette: next, roles });
        expect(second.failures).toEqual([]);
        expect(second.fitted).toEqual({});
        expect(second.roles).toEqual(first.roles);
      }),
      { numRuns: 300 },
    );
  });
});
