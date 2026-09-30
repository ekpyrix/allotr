import {
  composite,
  contrastRatio,
  formatContrastRatio,
  normalizeHex,
  relativeLuminance,
} from './color.ts';
import { fromOklch, toOklch } from './oklch.ts';
import { slotColor, type Palette } from './palette.ts';
import {
  DEFAULT_ROLE_MAP,
  ROLE_SPECS,
  ROLES,
  type Role,
  type RoleEntry,
} from './roles.ts';
import { CONTRAST_MINIMUM, type ThemeScheme } from './tokens.ts';

// Turns a palette and a role map into one colour per role. Each role that
// carries content is fitted: its OKLCH lightness moves in small steps, hue
// kept, until it meets its contrast on every surface it sits on.

/** OKLCH lightness moved per fitting step. */
export const FIT_STEP = 0.005;

/** How far a role was moved to pass. */
export type RoleFit = Readonly<{ from: string; to: string; deltaL: number }>;

export type RoleFailure =
  | Readonly<{
      role: Role;
      reason: 'contrast';
      surface: Role;
      ratio: number;
      required: number;
    }>
  | Readonly<{ role: Role; reason: 'unknown-slot'; slot: string }>;

export type ResolvedTheme = Readonly<{
  scheme: ThemeScheme;
  roles: Readonly<Record<Role, string>>;
  fitted: Readonly<Partial<Record<Role, RoleFit>>>;
  /** Empty when every role meets its contrast. */
  failures: readonly RoleFailure[];
}>;

export type ThemeInput = Readonly<{
  scheme: ThemeScheme;
  palette: Palette;
  roles?: Readonly<Partial<Record<Role, RoleEntry>>> | undefined;
}>;

function worstRatio(color: string, surfaces: readonly string[]): number {
  return Math.min(...surfaces.map((surface) => contrastRatio(color, surface)));
}

/**
 * Moves `color` away from its worst surface, one FIT_STEP at a time, until
 * it meets `need` on all of them; then the other way if that runs out of
 * room. Undefined when neither works, which needs surfaces on both sides.
 */
export function fitColor(
  color: string,
  surfaces: readonly string[],
  need: number,
): Omit<RoleFit, 'from'> | undefined {
  if (worstRatio(color, surfaces) >= need) return { to: color, deltaL: 0 };
  const start = toOklch(color);
  const worst = surfaces.reduce((a, b) =>
    contrastRatio(color, a) <= contrastRatio(color, b) ? a : b,
  );
  const away = relativeLuminance(color) < relativeLuminance(worst) ? -1 : 1;
  for (const direction of [away, -away]) {
    for (let steps = 1; ; steps += 1) {
      const l = start.l + direction * steps * FIT_STEP;
      if (l < 0 || l > 1) break;
      const candidate = fromOklch({ ...start, l });
      if (worstRatio(candidate, surfaces) >= need)
        return { to: candidate, deltaL: steps * FIT_STEP };
    }
  }
  return undefined;
}

function lookup(palette: Palette, slot: string): string | undefined {
  for (const name of slot.split('|')) {
    const color = slotColor(palette, name.trim());
    if (color !== undefined) return normalizeHex(color);
  }
  return undefined;
}

export function resolveTheme({
  scheme,
  palette,
  roles: overrides = {},
}: ThemeInput): ResolvedTheme {
  const defaults = DEFAULT_ROLE_MAP[scheme];
  const resolved: Partial<Record<Role, string>> = {};
  const fitted: Partial<Record<Role, RoleFit>> = {};
  const failures: RoleFailure[] = [];
  const colorOf = (role: Role) =>
    resolved[role] ?? normalizeHex(palette.neutrals.base);

  for (const role of ROLES) {
    const { kind, on } = ROLE_SPECS[role];
    const entry = overrides[role] ?? defaults[role];
    let color = lookup(palette, entry.slot);
    if (color === undefined) {
      failures.push({ role, reason: 'unknown-slot', slot: entry.slot });
      color =
        lookup(palette, defaults[role].slot) ??
        normalizeHex(
          kind === 'surface' ? palette.neutrals.base : palette.neutrals.text,
        );
    }
    if (entry.alpha !== undefined)
      color = composite(color, entry.alpha, colorOf(entry.over ?? 'canvas'));

    if (kind !== 'surface' && kind !== 'decorative') {
      const surfaces = on.map(colorOf);
      const need = CONTRAST_MINIMUM[kind];
      const fit =
        entry.fit === 'off' ? undefined : fitColor(color, surfaces, need);
      if (fit === undefined) {
        const original = color;
        on.forEach((surface, at) => {
          const ratio = contrastRatio(original, surfaces[at] ?? original);
          if (ratio < need)
            failures.push({
              role,
              reason: 'contrast',
              surface,
              ratio,
              required: need,
            });
        });
      } else if (fit.deltaL > 0) {
        fitted[role] = { from: color, ...fit };
        color = fit.to;
      }
    }
    resolved[role] = color;
  }

  return {
    scheme,
    roles: resolved as Record<Role, string>,
    fitted,
    failures,
  };
}

/** "hero-tight on card: 2.61:1, needs 3:1" */
export function describeRoleFailure(failure: RoleFailure): string {
  return failure.reason === 'unknown-slot'
    ? `${failure.role}: the palette has no colour named ${failure.slot}`
    : `${failure.role} on ${failure.surface}: ${formatContrastRatio(failure.ratio)}:1, needs ${String(failure.required)}:1`;
}
