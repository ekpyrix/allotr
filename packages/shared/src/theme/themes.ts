import { z } from 'zod';
import { darkTheme, lightTheme } from './builtin.ts';
import harbour from './community/harbour.json' with { type: 'json' };
import highContrastDark from './community/high-contrast-dark.json' with { type: 'json' };
import highContrastLight from './community/high-contrast-light.json' with { type: 'json' };
import paper from './community/paper.json' with { type: 'json' };
import {
  THEME_SCHEMES,
  themeSchemeSchema,
  themeTokensSchema,
  type ThemePair,
  type ThemeScheme,
  type ThemeTokens,
} from './tokens.ts';
import { validateTheme, type ContrastFailure } from './validate.ts';

export { THEME_SCHEMES, themeSchemeSchema, type ThemeScheme };

// Named themes (FR-W5). Each is for one scheme, and a user picks one theme
// for light and one for dark. Shipped themes have slug ids; custom themes
// get server UUIDs, so the two never clash.

export const themeIdSchema = z.string().min(1).max(64);
export const themeNameSchema = z.string().trim().min(1).max(40);

/** At most this many custom themes per user. */
export const CUSTOM_THEME_LIMIT = 20;

export const themeBodySchema = z.object({
  name: themeNameSchema,
  scheme: themeSchemeSchema,
  tokens: themeTokensSchema,
});
export type ThemeBody = z.infer<typeof themeBodySchema>;

export const customThemeSchema = themeBodySchema.extend({ id: themeIdSchema });
export type CustomTheme = z.infer<typeof customThemeSchema>;

export const customThemeListSchema = z.object({
  themes: z.array(customThemeSchema),
});

export type NamedTheme = Readonly<{
  id: string;
  name: string;
  scheme: ThemeScheme;
  tokens: ThemeTokens;
}>;

/** The file a theme is imported from and downloaded as. */
export const THEME_FILE_FORMAT = 'allotr-theme';

export const themeFileSchema = z.strictObject({
  format: z.literal(THEME_FILE_FORMAT),
  version: z.literal(1),
  name: themeNameSchema,
  scheme: themeSchemeSchema,
  tokens: themeTokensSchema,
});
export type ThemeFile = z.infer<typeof themeFileSchema>;

export function toThemeFile(theme: ThemeBody): ThemeFile {
  return {
    format: THEME_FILE_FORMAT,
    version: 1,
    name: theme.name,
    scheme: theme.scheme,
    tokens: theme.tokens,
  };
}

function community(id: string, file: unknown): NamedTheme {
  const { name, scheme, tokens } = themeFileSchema.parse(file);
  return { id, name, scheme, tokens };
}

/** Built-in themes first, then community themes, light before dark. */
export const SHIPPED_THEMES: readonly NamedTheme[] = [
  { id: 'light', name: 'Allotr light', scheme: 'light', tokens: lightTheme },
  { id: 'dark', name: 'Allotr dark', scheme: 'dark', tokens: darkTheme },
  community('high-contrast-light', highContrastLight),
  community('paper', paper),
  community('high-contrast-dark', highContrastDark),
  community('harbour', harbour),
];

/** The theme each slot starts with. */
export const DEFAULT_THEME_ID: Readonly<Record<ThemeScheme, string>> = {
  light: 'light',
  dark: 'dark',
};

/** A shipped theme, or one of the given custom themes. */
export function findTheme(
  id: string,
  custom: readonly NamedTheme[],
): NamedTheme | undefined {
  return (
    SHIPPED_THEMES.find((theme) => theme.id === id) ??
    custom.find((theme) => theme.id === id)
  );
}

/** A slot's theme; an unknown id or a wrong scheme gives the default. */
export function slotTheme(
  id: string,
  scheme: ThemeScheme,
  custom: readonly NamedTheme[],
): NamedTheme {
  const theme = findTheme(id, custom);
  if (theme?.scheme === scheme) return theme;
  const fallback = findTheme(DEFAULT_THEME_ID[scheme], []);
  if (fallback === undefined) throw new Error(`No ${scheme} default theme`);
  return fallback;
}

/** Two decimals, floored so a failing pair never reads as its minimum. */
export function formatContrastRatio(value: number): string {
  return (Math.floor(value * 100) / 100).toFixed(2);
}

/** "plot", or "input 50% over background" for a tinted surface. */
export function describeSurface(
  pair: Pick<ThemePair, 'background' | 'tint'>,
): string {
  return pair.tint === undefined
    ? pair.background
    : `${pair.tint.token} ${String(Math.round(pair.tint.alpha * 100))}% over ${pair.background}`;
}

/** "ring on plot: 1.00:1, needs 3:1" */
export function describeContrastFailure(failure: ContrastFailure): string {
  return `${failure.foreground} on ${describeSurface(failure)}: ${formatContrastRatio(failure.ratio)}:1, needs ${String(failure.required)}:1`;
}

export type ThemeProblem = Readonly<{ path: string; message: string }>;

/**
 * Reads an imported theme file. Problems are JSON Pointers into the file,
 * as the API reports them; every failing contrast pair is listed.
 */
export function parseThemeFile(
  data: unknown,
):
  | { ok: true; theme: ThemeFile }
  | { ok: false; problems: readonly ThemeProblem[] } {
  const parsed = themeFileSchema.safeParse(data);
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.map((issue) => ({
        path: `/${issue.path.map(String).join('/')}`,
        message: issue.message,
      })),
    };
  }
  const problems = contrastProblems(parsed.data.tokens, parsed.data.scheme);
  return problems.length === 0
    ? { ok: true, theme: parsed.data }
    : { ok: false, problems };
}

/** One problem per failing pair, pointing at its foreground token. */
export function contrastProblems(
  tokens: ThemeTokens,
  scheme: ThemeScheme,
): ThemeProblem[] {
  return validateTheme(tokens, scheme).map((failure) => ({
    path: `/tokens/${failure.foreground}`,
    message: describeContrastFailure(failure),
  }));
}
