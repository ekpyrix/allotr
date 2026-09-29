import {
  DEFAULT_THEME_ID,
  darkTheme,
  lightTheme,
  slotTheme,
  THEME_SCHEMES,
  THEME_TOKENS,
  themeModeSchema,
  themeTokensSchema,
  type Appearance,
  type NamedTheme,
  type ThemeMode,
  type ThemeTokens,
} from '@allotr/shared';
import { z } from 'zod';

// The theme mode, and the colours of any slot not on its built-in theme,
// are cached in localStorage so public/theme-init.js can apply them before
// first paint; the account's copy wins once signed in. That script repeats
// the keys and the resolution rule: change both together.

export const THEME_MODE_KEY = 'allotr.theme-mode';
export const THEME_TOKENS_KEY = 'allotr.theme-tokens';

export type ColorScheme = 'light' | 'dark';

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

/** Colours per scheme, only for slots not on their built-in theme. */
export type SlotTokens = Partial<Record<ColorScheme, ThemeTokens>>;

const slotTokensSchema = z.object({
  light: themeTokensSchema.optional(),
  dark: themeTokensSchema.optional(),
});

/** The colours for each slot of the appearance. */
export function slotTokens(
  appearance: Appearance,
  custom: readonly NamedTheme[],
): SlotTokens {
  const tokens: SlotTokens = {};
  for (const scheme of THEME_SCHEMES) {
    const theme = slotTheme(appearance[scheme], scheme, custom);
    if (theme.id !== DEFAULT_THEME_ID[scheme]) tokens[scheme] = theme.tokens;
  }
  return tokens;
}

export function readCachedTokens(
  storage: Pick<Storage, 'getItem'> | undefined,
): SlotTokens {
  try {
    const raw = storage?.getItem(THEME_TOKENS_KEY);
    if (raw === null || raw === undefined) return {};
    const parsed = slotTokensSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return {};
    const tokens: SlotTokens = {};
    for (const scheme of THEME_SCHEMES) {
      const value = parsed.data[scheme];
      if (value !== undefined) tokens[scheme] = value;
    }
    return tokens;
  } catch {
    return {};
  }
}

export function cacheTokens(
  storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined,
  tokens: SlotTokens,
): void {
  try {
    if (Object.keys(tokens).length === 0) storage?.removeItem(THEME_TOKENS_KEY);
    else storage?.setItem(THEME_TOKENS_KEY, JSON.stringify(tokens));
  } catch {
    // As for the mode: the colours last for this page.
  }
}

/** CSS custom properties that override the stylesheet's built-in values. */
export function tokenProperties(tokens: ThemeTokens): [string, string][] {
  return THEME_TOKENS.map((token) => [`--${token}`, tokens[token]]);
}

/**
 * Sets data-theme, the slot's colours (none for a built-in theme) and the
 * browser's UI colour.
 */
export function applyScheme(
  doc: Document,
  scheme: ColorScheme,
  tokens?: ThemeTokens,
): void {
  const root = doc.documentElement;
  root.dataset.theme = scheme;
  for (const [name, value] of tokenProperties(tokens ?? lightTheme)) {
    if (tokens === undefined) root.style.removeProperty(name);
    else root.style.setProperty(name, value);
  }
  const { background } = tokens ?? (scheme === 'dark' ? darkTheme : lightTheme);
  for (const meta of doc.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute('content', background);
  }
}
