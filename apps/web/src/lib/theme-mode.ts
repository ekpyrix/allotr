import {
  DEFAULT_PALETTE_THEME_ID,
  findPaletteTheme,
  hexColorSchema,
  paletteTheme,
  ROLES,
  slotPaletteTheme,
  THEME_SCHEMES,
  themeModeSchema,
  toThemeFileV2,
  type Appearance,
  type CustomThemeView,
  type PaletteTheme,
  type Role,
  type ThemeMode,
} from '@allotr/shared';
import { z } from 'zod';

// The theme mode, and the resolved role colours of any slot not on its
// default theme, are cached in localStorage so public/theme-init.js can
// apply them before first paint; the account's copy wins once signed in.
// That script repeats the keys and the resolution rule: change both
// together.

export const THEME_MODE_KEY = 'allotr.theme-mode';
export const THEME_ROLES_KEY = 'allotr.theme-roles';
/** The v1 cache of 16 tokens; dropped on the next write. */
export const LEGACY_TOKENS_KEY = 'allotr.theme-tokens';

export type ColorScheme = 'light' | 'dark';
export type RoleColors = Readonly<Record<Role, string>>;

export function resolveScheme(
  mode: ThemeMode,
  prefersDark: boolean,
): ColorScheme {
  if (mode === 'system') return prefersDark ? 'dark' : 'light';
  return mode;
}

export function readCachedMode(
  storage: Pick<Storage, 'getItem'> | undefined,
): ThemeMode {
  try {
    const parsed = themeModeSchema.safeParse(storage?.getItem(THEME_MODE_KEY));
    return parsed.success ? parsed.data : 'system';
  } catch {
    return 'system';
  }
}

export function cacheMode(
  storage: Pick<Storage, 'setItem'> | undefined,
  mode: ThemeMode,
): void {
  try {
    storage?.setItem(THEME_MODE_KEY, mode);
  } catch {
    // Private browsing or blocked storage: the choice lasts for this page.
  }
}

/** A user's custom themes as palette themes, for painting and picking. */
export function customPaletteThemes(
  views: readonly CustomThemeView[],
): PaletteTheme[] {
  return views.map((view) => paletteTheme(view.id, toThemeFileV2(view)));
}

/** Role colours per scheme, only for slots not on their default theme. */
export type SlotRoles = Partial<Record<ColorScheme, RoleColors>>;

const roleColorsSchema = z.strictObject(
  Object.fromEntries(ROLES.map((role) => [role, hexColorSchema])) as Record<
    Role,
    typeof hexColorSchema
  >,
);
const slotRolesSchema = z.object({
  light: roleColorsSchema.optional(),
  dark: roleColorsSchema.optional(),
});

/** The role colours for each slot of the appearance. */
export function slotRoles(
  appearance: Appearance,
  custom: readonly PaletteTheme[],
): SlotRoles {
  const roles: SlotRoles = {};
  for (const scheme of THEME_SCHEMES) {
    const theme = slotPaletteTheme(appearance[scheme], scheme, custom);
    if (theme.id !== DEFAULT_PALETTE_THEME_ID[scheme])
      roles[scheme] = theme.resolved.roles;
  }
  return roles;
}

export function readCachedRoles(
  storage: Pick<Storage, 'getItem'> | undefined,
): SlotRoles {
  try {
    const raw = storage?.getItem(THEME_ROLES_KEY);
    if (raw === null || raw === undefined) return {};
    const parsed = slotRolesSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return {};
    const roles: SlotRoles = {};
    for (const scheme of THEME_SCHEMES) {
      const value = parsed.data[scheme];
      if (value !== undefined) roles[scheme] = value;
    }
    return roles;
  } catch {
    return {};
  }
}

export function cacheRoles(
  storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined,
  roles: SlotRoles,
): void {
  try {
    storage?.removeItem(LEGACY_TOKENS_KEY);
    if (Object.keys(roles).length === 0) storage?.removeItem(THEME_ROLES_KEY);
    else storage?.setItem(THEME_ROLES_KEY, JSON.stringify(roles));
  } catch {
    // As for the mode: the colours last for this page.
  }
}

/** CSS custom properties that override the stylesheet's default roles. */
export function roleProperties(roles: RoleColors): [string, string][] {
  return ROLES.map((role) => [`--${role}`, roles[role]]);
}

function defaultCanvas(scheme: ColorScheme): string {
  return (
    findPaletteTheme(DEFAULT_PALETTE_THEME_ID[scheme], [])?.resolved.roles
      .canvas ?? '#ffffff'
  );
}

/**
 * Sets data-theme, the slot's role colours (none for the default theme)
 * and the browser's UI colour.
 */
export function applyScheme(
  doc: Document,
  scheme: ColorScheme,
  roles?: RoleColors,
): void {
  const root = doc.documentElement;
  root.dataset.theme = scheme;
  for (const role of ROLES) {
    const name = `--${role}`;
    if (roles === undefined) root.style.removeProperty(name);
    else root.style.setProperty(name, roles[role]);
  }
  const canvas = roles?.canvas ?? defaultCanvas(scheme);
  for (const meta of doc.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute('content', canvas);
  }
}
