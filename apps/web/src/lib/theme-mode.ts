import {
  darkTheme,
  lightTheme,
  themeModeSchema,
  type ThemeMode,
} from '@allotr/shared';

// The theme mode is cached in localStorage so public/theme-init.js can apply
// it before first paint; the account's copy wins once signed in. That script
// repeats the key and the resolution rule: change both together.

export const THEME_MODE_KEY = 'allotr.theme-mode';

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

/** Sets data-theme and the browser's UI colour. */
export function applyScheme(doc: Document, scheme: ColorScheme): void {
  doc.documentElement.dataset.theme = scheme;
  const { background } = scheme === 'dark' ? darkTheme : lightTheme;
  for (const meta of doc.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute('content', background);
  }
}
