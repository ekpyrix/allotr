import { z } from 'zod';
import { FAMILY_FILES } from './families/index.ts';
import {
  completePalette,
  partialPaletteSchema,
  type Palette,
  type PartialPalette,
} from './palette.ts';
import {
  describeRoleFailure,
  resolveTheme,
  type ResolvedTheme,
} from './resolve.ts';
import {
  roleEntrySchema,
  themeRoleSchema,
  type Role,
  type RoleEntry,
} from './roles.ts';
import {
  findTheme,
  THEME_FILE_FORMAT,
  themeFileSchema,
  themeNameSchema,
  type ThemeFile,
  type ThemeProblem,
} from './themes.ts';
import {
  themeSchemeSchema,
  type ThemeScheme,
  type ThemeTokens,
} from './tokens.ts';

// Theme file v2 (ADR 0016): a palette plus the roles it sets, resolved
// with contrast fitting. v1 files, the 16-token themes, convert to v2 with
// their roles pinned to the old colours, so they look the same. Shipped
// themes are the palette families (ADR 0017) and the converted Allotr
// themes. The v1 exports in themes.ts stay until the server and the web
// app read v2.

export const familyIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]{0,31}$/, 'Use a-z, 0-9 and -');

export const themeCreditSchema = z.strictObject({
  author: z.string().trim().min(1).max(80),
  licence: z.string().trim().min(1).max(40),
  url: z.url(),
});
export type ThemeCredit = z.infer<typeof themeCreditSchema>;

/** Roles a theme sets; every other role comes from the default map. */
export const themeRolesSchema = z.partialRecord(
  themeRoleSchema,
  roleEntrySchema,
);
export type ThemeRoles = Readonly<Partial<Record<Role, RoleEntry>>>;

/** A v2 file. Its palette may leave out slots; reading completes it. */
export const themeFileV2Schema = z.strictObject({
  format: z.literal(THEME_FILE_FORMAT),
  version: z.literal(2),
  name: themeNameSchema,
  family: familyIdSchema.optional(),
  scheme: themeSchemeSchema,
  credit: themeCreditSchema.optional(),
  palette: partialPaletteSchema,
  roles: themeRolesSchema.optional(),
});
export type ThemeFileV2 = z.infer<typeof themeFileV2Schema>;

export type PaletteTheme = Readonly<{
  id: string;
  name: string;
  scheme: ThemeScheme;
  family?: string | undefined;
  credit?: ThemeCredit | undefined;
  palette: Palette;
  roles: ThemeRoles;
  resolved: ResolvedTheme;
}>;

/**
 * A v1 theme as a palette. Page, surfaces and text become neutral slots;
 * every other token becomes an accent of the same name, and the roles are
 * pinned to them, so the theme looks as it did.
 */
export function convertV1(
  tokens: ThemeTokens,
  scheme: ThemeScheme,
): { palette: Palette; roles: ThemeRoles } {
  const partial: PartialPalette = {
    neutrals: {
      base: tokens.background,
      mantle: tokens.plot,
      crust: tokens.muted,
      surface0: tokens.border,
      overlay1: tokens.input,
      subtext0: tokens['muted-foreground'],
      text: tokens.foreground,
    },
    accents: {
      today: tokens.today,
      'today-text': tokens['today-text'],
      over: tokens.over,
      positive: tokens.positive,
      negative: tokens.negative,
      primary: tokens.primary,
      'primary-foreground': tokens['primary-foreground'],
      ring: tokens.ring,
      destructive: tokens.destructive,
    },
    hues: {
      red: 'destructive',
      orange: 'today',
      yellow: 'today',
      green: 'positive',
    },
  };
  return {
    palette: completePalette(partial, scheme),
    roles: {
      card: { slot: 'mantle' },
      'card-raised': { slot: 'crust' },
      'hero-ok': { slot: 'today' },
      'hero-tight': { slot: 'today' },
      'hero-over': { slot: 'over' },
      positive: { slot: 'positive' },
      negative: { slot: 'negative' },
      primary: { slot: 'primary' },
      'on-primary': { slot: 'primary-foreground' },
      ring: { slot: 'ring' },
      danger: { slot: 'destructive' },
      outline: { slot: 'overlay1' },
      'outline-variant': { slot: 'surface0' },
    },
  };
}

type ThemeFields = Readonly<{
  name: string;
  scheme: ThemeScheme;
  family?: string | undefined;
  credit?: ThemeCredit | undefined;
  palette: Palette;
  roles?: ThemeRoles | undefined;
}>;

/** A theme as a v2 file, with its palette complete. */
export function toThemeFileV2(theme: ThemeFields): ThemeFileV2 {
  return {
    format: THEME_FILE_FORMAT,
    version: 2,
    name: theme.name,
    ...(theme.family === undefined ? {} : { family: theme.family }),
    scheme: theme.scheme,
    ...(theme.credit === undefined ? {} : { credit: theme.credit }),
    palette: theme.palette,
    ...(theme.roles === undefined || Object.keys(theme.roles).length === 0
      ? {}
      : { roles: theme.roles }),
  };
}

/** Any theme file as v2, its palette completed. */
export function toV2(file: ThemeFile | ThemeFileV2): ThemeFileV2 {
  if (file.version === 1) {
    return toThemeFileV2({
      name: file.name,
      scheme: file.scheme,
      ...convertV1(file.tokens, file.scheme),
    });
  }
  return {
    ...file,
    palette: completePalette(file.palette, file.scheme),
  };
}

/**
 * A v2 file as a theme with this id, its palette completed. Resolving is
 * left until `resolved` is first read, so loading the shipped list costs
 * nothing until a theme is painted.
 */
export function paletteTheme(id: string, file: ThemeFileV2): PaletteTheme {
  const palette = completePalette(file.palette, file.scheme);
  const roles = file.roles ?? {};
  let resolved: ResolvedTheme | undefined;
  return {
    id,
    name: file.name,
    scheme: file.scheme,
    family: file.family,
    credit: file.credit,
    palette,
    roles,
    get resolved() {
      resolved ??= resolveTheme({ scheme: file.scheme, palette, roles });
      return resolved;
    },
  };
}

function problemsOf(error: z.ZodError): ThemeProblem[] {
  return error.issues.map((issue) => ({
    path: `/${issue.path.map(String).join('/')}`,
    message: issue.message,
  }));
}

/**
 * Reads an imported theme file, v1 or v2, as v2. Problems are JSON
 * Pointers into the file: a role that cannot meet its contrast points at
 * `/roles/<role>` when the file sets that role, and at `/palette` when it
 * comes from the default map.
 */
export function readThemeFile(
  data: unknown,
):
  | { ok: true; theme: ThemeFileV2 }
  | { ok: false; problems: readonly ThemeProblem[] } {
  const version =
    typeof data === 'object' && data !== null && 'version' in data
      ? data.version
      : undefined;
  const schema =
    version === 1 ? themeFileSchema : version === 2 ? themeFileV2Schema : null;
  if (schema === null) {
    return {
      ok: false,
      problems: [{ path: '/version', message: 'Use version 1 or 2' }],
    };
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) return { ok: false, problems: problemsOf(parsed.error) };
  const theme = toV2(parsed.data);
  const { failures } = paletteTheme('', theme).resolved;
  if (failures.length === 0) return { ok: true, theme };
  return {
    ok: false,
    problems: failures.map((failure) => ({
      path:
        theme.roles?.[failure.role] === undefined
          ? '/palette'
          : `/roles/${failure.role}`,
      message: describeRoleFailure(failure),
    })),
  };
}

function slug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** A v1 shipped theme, converted and pinned so it looks the same. */
function converted(id: string, name: string, family: string): PaletteTheme {
  const theme = findTheme(id, []);
  if (theme === undefined) throw new Error(`No shipped theme ${id}`);
  return paletteTheme(
    id === 'light' || id === 'dark' ? `allotr-classic-${id}` : id,
    toThemeFileV2({
      name,
      family,
      scheme: theme.scheme,
      ...convertV1(theme.tokens, theme.scheme),
    }),
  );
}

const ALLOTR_THEMES: readonly PaletteTheme[] = [
  converted('light', 'Allotr Classic Light', 'allotr-classic'),
  converted('dark', 'Allotr Classic Dark', 'allotr-classic'),
  converted('high-contrast-light', 'High contrast light', 'high-contrast'),
  converted('high-contrast-dark', 'High contrast dark', 'high-contrast'),
  converted('paper', 'Paper', 'paper'),
  converted('harbour', 'Harbour', 'harbour'),
];

const FAMILY_THEMES: readonly PaletteTheme[] = Object.entries(
  FAMILY_FILES,
).flatMap(([family, files]) =>
  files.map((data) => {
    const file = themeFileV2Schema.parse(data);
    if (file.family !== family)
      throw new Error(`${file.name} is not in the ${family} family`);
    return paletteTheme(slug(file.name), file);
  }),
);

/** Every shipped theme: the palette families, then the Allotr themes. */
export const PALETTE_THEMES: readonly PaletteTheme[] = [
  ...FAMILY_THEMES,
  ...ALLOTR_THEMES,
];

export type ThemeFamily = Readonly<{
  id: string;
  /** The family's name: the first theme's name up to its flavour. */
  name: string;
  credit?: ThemeCredit | undefined;
  /** Theme ids, light flavours first. */
  themes: readonly string[];
}>;

const FAMILY_NAMES: Readonly<Record<string, string>> = {
  catppuccin: 'Catppuccin',
  nord: 'Nord',
  solarized: 'Solarized',
  gruvbox: 'Gruvbox',
  dracula: 'Dracula',
  'tokyo-night': 'Tokyo Night',
  'rose-pine': 'Rosé Pine',
  'allotr-classic': 'Allotr Classic',
  'high-contrast': 'High contrast',
  paper: 'Paper',
  harbour: 'Harbour',
};

export const THEME_FAMILIES: readonly ThemeFamily[] = [
  ...new Set(PALETTE_THEMES.map((theme) => theme.family ?? theme.id)),
].map((id) => {
  const themes = PALETTE_THEMES.filter((theme) => theme.family === id);
  return {
    id,
    name: FAMILY_NAMES[id] ?? id,
    credit: themes[0]?.credit,
    themes: themes.map((theme) => theme.id),
  };
});

/** Earlier ids of shipped themes and the theme each now names. */
export const THEME_ID_ALIASES: Readonly<Record<string, string>> = {
  light: 'allotr-classic-light',
  dark: 'allotr-classic-dark',
};

/** The theme each slot starts with. */
export const DEFAULT_PALETTE_THEME_ID: Readonly<Record<ThemeScheme, string>> = {
  light: 'catppuccin-latte',
  dark: 'catppuccin-mocha',
};

/** A shipped theme by id or earlier id, or one of the given custom themes. */
export function findPaletteTheme(
  id: string,
  custom: readonly PaletteTheme[],
): PaletteTheme | undefined {
  const target = Object.hasOwn(THEME_ID_ALIASES, id)
    ? (THEME_ID_ALIASES[id] ?? id)
    : id;
  return (
    PALETTE_THEMES.find((theme) => theme.id === target) ??
    custom.find((theme) => theme.id === target)
  );
}

/** A slot's theme; an unknown id or a wrong scheme gives the default. */
export function slotPaletteTheme(
  id: string,
  scheme: ThemeScheme,
  custom: readonly PaletteTheme[],
): PaletteTheme {
  const theme = findPaletteTheme(id, custom);
  if (theme?.scheme === scheme) return theme;
  const fallback = findPaletteTheme(DEFAULT_PALETTE_THEME_ID[scheme], []);
  if (fallback === undefined) throw new Error(`No ${scheme} default theme`);
  return fallback;
}
