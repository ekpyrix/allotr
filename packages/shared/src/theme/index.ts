import { z } from 'zod';
import { DEFAULT_THEME_ID, themeIdSchema } from './themes.ts';

export {
  composite,
  contrastRatio,
  hexColorSchema,
  relativeLuminance,
} from './color.ts';
export {
  CONTRAST_MINIMUM,
  THEME_PAIRS,
  THEME_TOKENS,
  themeTokensSchema,
  type ContrastKind,
  type ThemePair,
  type ThemeTint,
  type ThemeToken,
  type ThemeTokens,
} from './tokens.ts';
export {
  pairRatio,
  pairSurface,
  themePairs,
  validateTheme,
  type ContrastFailure,
} from './validate.ts';
export { darkTheme, lightTheme } from './builtin.ts';
export {
  contrastProblems,
  CUSTOM_THEME_LIMIT,
  customThemeListSchema,
  customThemeSchema,
  DEFAULT_THEME_ID,
  describeContrastFailure,
  describeSurface,
  findTheme,
  formatContrastRatio,
  parseThemeFile,
  SHIPPED_THEMES,
  slotTheme,
  THEME_FILE_FORMAT,
  THEME_SCHEMES,
  themeBodySchema,
  themeFileSchema,
  themeIdSchema,
  themeNameSchema,
  themeSchemeSchema,
  toThemeFile,
  type CustomTheme,
  type NamedTheme,
  type ThemeBody,
  type ThemeFile,
  type ThemeProblem,
  type ThemeScheme,
} from './themes.ts';

/** `system` follows the device's light or dark preference. */
export const THEME_MODES = ['light', 'dark', 'system'] as const;
export const themeModeSchema = z.enum(THEME_MODES);
export type ThemeMode = z.infer<typeof themeModeSchema>;

/** A user's mode and the theme for each scheme. */
export const appearanceSchema = z.object({
  mode: themeModeSchema,
  light: themeIdSchema,
  dark: themeIdSchema,
});
export type Appearance = z.infer<typeof appearanceSchema>;

/** A change; a slot left out keeps its theme, as clients before slots do. */
export const appearanceBodySchema = appearanceSchema.partial({
  light: true,
  dark: true,
});
export type AppearanceBody = z.infer<typeof appearanceBodySchema>;

export const DEFAULT_APPEARANCE: Appearance = {
  mode: 'system',
  ...DEFAULT_THEME_ID,
};
