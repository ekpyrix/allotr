import { z } from 'zod';

export { contrastRatio, hexColorSchema, relativeLuminance } from './color.ts';
export {
  CONTRAST_MINIMUM,
  THEME_PAIRS,
  THEME_TOKENS,
  themeTokensSchema,
  type ContrastKind,
  type ThemePair,
  type ThemeToken,
  type ThemeTokens,
} from './tokens.ts';
export { validateTheme, type ContrastFailure } from './validate.ts';
export { darkTheme, lightTheme } from './builtin.ts';

/** `system` follows the device's light or dark preference. */
export const THEME_MODES = ['light', 'dark', 'system'] as const;
export const themeModeSchema = z.enum(THEME_MODES);
export type ThemeMode = z.infer<typeof themeModeSchema>;

/** A user's appearance settings; custom themes (#69) add to it. */
export const appearanceSchema = z.object({ mode: themeModeSchema });
export type Appearance = z.infer<typeof appearanceSchema>;
