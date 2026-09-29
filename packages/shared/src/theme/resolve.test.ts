import { describe, expect, it } from 'vitest';
import { composite, contrastRatio, relativeLuminance } from './color.ts';
import { fromOklch, toOklch } from './oklch.ts';
import {
  describeRoleFailure,
  FIT_STEP,
  fitColor,
  resolveTheme,
  type ResolvedTheme,
} from './resolve.ts';
import { ROLE_SPECS, ROLES, type Role } from './roles.ts';
import { fixtureDawn, fixtureDusk } from './testing.ts';
import { CONTRAST_MINIMUM } from './tokens.ts';

const dawn = resolveTheme({ scheme: 'light', palette: fixtureDawn });
const dusk = resolveTheme({ scheme: 'dark', palette: fixtureDusk });

function need(role: Role): number | undefined {
  const { kind } = ROLE_SPECS[role];
  return kind === 'surface' || kind === 'decorative'
    ? undefined
    : CONTRAST_MINIMUM[kind];
}

describe.each<[string, ResolvedTheme]>([
  ['light', dawn],
  ['dark', dusk],
])('resolveTheme (%s)', (_, theme) => {
  it('resolves every role with no failures', () => {
    expect(Object.keys(theme.roles).sort()).toEqual([...ROLES].sort());
    expect(theme.failures).toEqual([]);
  });

  it('meets every contrast requirement', () => {
    for (const role of ROLES) {
      const required = need(role);
      if (required === undefined) continue;
      for (const surface of ROLE_SPECS[role].on) {
        expect(
          contrastRatio(theme.roles[role], theme.roles[surface]),
          `${role} on ${surface}`,
        ).toBeGreaterThanOrEqual(required);
      }
    }
  });

  it('takes each fitting step only when needed', () => {
    for (const [role, fit] of Object.entries(theme.fitted)) {
      const required = need(role as Role) ?? 0;
      const surfaces = ROLE_SPECS[role as Role].on.map(
        (surface) => theme.roles[surface],
      );
      const start = toOklch(fit.from);
      const direction = Math.sign(toOklch(fit.to).l - start.l);
      const steps = Math.round(fit.deltaL / FIT_STEP);
      const before = fromOklch({
        ...start,
        l: start.l + direction * (steps - 1) * FIT_STEP,
      });
      const worst = Math.min(
        ...surfaces.map((surface) => contrastRatio(before, surface)),
      );
      expect(worst, role).toBeLessThan(required);
    }
  });

  it('keeps the hue of chromatic colours', () => {
    for (const [role, fit] of Object.entries(theme.fitted)) {
      const from = toOklch(fit.from);
      const to = toOklch(fit.to);
      if (from.c <= 0.03 || to.c <= 0.03) continue;
      let dh = Math.abs(to.h - from.h);
      if (dh > Math.PI) dh = 2 * Math.PI - dh;
      expect(dh, role).toBeLessThan(0.035);
    }
  });
});

describe('resolveTheme on a weak light palette', () => {
  it('fits muted text that fails on the raised card', () => {
    expect(
      contrastRatio(fixtureDawn.neutrals.subtext0, fixtureDawn.neutrals.crust),
    ).toBeLessThan(4.5);
    const fit = dawn.fitted['text-muted'];
    expect(fit?.deltaL).toBeGreaterThan(0);
    expect(relativeLuminance(fit?.to ?? '')).toBeLessThan(
      relativeLuminance(fit?.from ?? ''),
    );
  });

  it('fits the orange hero state to large-text contrast', () => {
    expect(
      contrastRatio(
        fixtureDawn.accents.ember ?? '',
        fixtureDawn.neutrals.mantle,
      ),
    ).toBeLessThan(3);
    expect(dawn.fitted['hero-tight']?.deltaL).toBeGreaterThan(0);
  });

  it('falls back to red for "over" when there is no maroon', () => {
    expect(dawn.fitted['hero-over']?.from ?? dawn.roles['hero-over']).toBe(
      fixtureDawn.accents.rose,
    );
    expect(dusk.roles['hero-over']).toBe(fixtureDusk.accents.maroon);
  });

  it('composites containers exactly and never fits them', () => {
    expect(dawn.roles['warning-container']).toBe(
      composite(fixtureDawn.accents.ember ?? '', 0.18, dawn.roles.card),
    );
    expect(dusk.roles['warning-container']).toBe(
      composite(fixtureDusk.accents.ember ?? '', 0.24, dusk.roles.card),
    );
    expect(dawn.fitted['warning-container']).toBeUndefined();
  });

  it('writes every colour as lower-case #rrggbb', () => {
    const theme = resolveTheme({
      scheme: 'light',
      palette: {
        ...fixtureDawn,
        neutrals: { ...fixtureDawn.neutrals, text: '#4F4C6B', base: '#FFF' },
      },
    });
    for (const color of Object.values(theme.roles))
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('fit: off', () => {
  const theme = resolveTheme({
    scheme: 'light',
    palette: fixtureDawn,
    roles: { 'hero-tight': { slot: 'orange', fit: 'off' } },
  });

  it('keeps the colour and reports each failing surface', () => {
    expect(theme.roles['hero-tight']).toBe(fixtureDawn.accents.ember);
    expect(theme.fitted['hero-tight']).toBeUndefined();
    expect(theme.failures).toEqual([
      {
        role: 'hero-tight',
        reason: 'contrast',
        surface: 'card',
        ratio: contrastRatio(
          fixtureDawn.accents.ember ?? '',
          fixtureDawn.neutrals.mantle,
        ),
        required: 3,
      },
    ]);
  });

  it('describes a failure', () => {
    const [failure] = theme.failures;
    expect(failure && describeRoleFailure(failure)).toMatch(
      /^hero-tight on card: \d\.\d\d:1, needs 3:1$/,
    );
  });
});

describe('on-primary', () => {
  it('moves away from primary: lighter on a dark primary, even in light', () => {
    const theme = resolveTheme({
      scheme: 'light',
      palette: fixtureDawn,
      roles: {
        primary: { slot: 'text' },
        'on-primary': { slot: 'subtext1' },
      },
    });
    const fit = theme.fitted['on-primary'];
    expect(fit).toBeDefined();
    expect(relativeLuminance(fit?.to ?? '')).toBeGreaterThan(
      relativeLuminance(fit?.from ?? ''),
    );
    expect(theme.failures).toEqual([]);
  });
});

describe('unknown slots', () => {
  it('reports the slot and falls back to the default role map', () => {
    const theme = resolveTheme({
      scheme: 'dark',
      palette: fixtureDusk,
      roles: { ring: { slot: 'chartreuse' } },
    });
    expect(theme.failures).toEqual([
      { role: 'ring', reason: 'unknown-slot', slot: 'chartreuse' },
    ]);
    expect(theme.roles.ring).toBe(dusk.roles.ring);
    const [failure] = theme.failures;
    expect(failure && describeRoleFailure(failure)).toBe(
      'ring: the palette has no colour named chartreuse',
    );
  });

  it('takes the first name the palette has in an a|b list', () => {
    const theme = resolveTheme({
      scheme: 'dark',
      palette: fixtureDusk,
      roles: { ring: { slot: 'chartreuse|gold|azure' } },
    });
    expect(theme.roles.ring).toBe(fixtureDusk.accents.gold);
  });
});

describe('fitColor', () => {
  it('leaves a passing colour alone', () => {
    expect(fitColor('#000000', ['#ffffff'], 4.5)).toEqual({
      to: '#000000',
      deltaL: 0,
    });
  });

  it('tries the other way when the first runs out of room', () => {
    // Nearly white on white: lighter is impossible, so it goes darker.
    const fit = fitColor('#fafafa', ['#ffffff', '#f0f0f0'], 3);
    expect(fit).toBeDefined();
    expect(relativeLuminance(fit?.to ?? '')).toBeLessThan(
      relativeLuminance('#fafafa'),
    );
  });

  it('gives undefined when surfaces on both sides leave no room', () => {
    expect(fitColor('#808080', ['#000000', '#ffffff'], 12)).toBeUndefined();
  });
});
