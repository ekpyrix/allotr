import { z } from 'zod';
import { hexColorSchema } from './color.ts';

// The tokens every theme sets, and the foreground/background pairs that must
// meet WCAG 2.2 AA. Pairs are fixed here so a custom theme cannot drop one.
// `border` is decorative (exempt under SC 1.4.11) and is not paired.

export const THEME_TOKENS = [
  'background',
  'foreground',
  'muted',
  'muted-foreground',
  'plot',
  'today',
  'today-text',
  'over',
  'positive',
  'negative',
  'primary',
  'primary-foreground',
  'border',
  'input',
  'ring',
  'destructive',
] as const;
export type ThemeToken = (typeof THEME_TOKENS)[number];
export type ThemeTokens = Readonly<Record<ThemeToken, string>>;

export const themeTokensSchema = z.strictObject(
  Object.fromEntries(
    THEME_TOKENS.map((token) => [token, hexColorSchema]),
  ) as Record<ThemeToken, typeof hexColorSchema>,
);

// Each theme is for one scheme. The web app styles a few controls per
// scheme (see THEME_PAIRS), so some pairs apply to one scheme only.
export const THEME_SCHEMES = ['light', 'dark'] as const;
export const themeSchemeSchema = z.enum(THEME_SCHEMES);
export type ThemeScheme = z.infer<typeof themeSchemeSchema>;

export type ContrastKind = 'text' | 'large-text' | 'non-text';

/** WCAG 2.2 AA: SC 1.4.3 for text, SC 1.4.11 for UI components. */
export const CONTRAST_MINIMUM: Readonly<Record<ContrastKind, number>> = {
  text: 4.5,
  'large-text': 3,
  'non-text': 3,
};

/** A token laid over the background at an opacity from 0 to 1. */
export type ThemeTint = Readonly<{ token: ThemeToken; alpha: number }>;

export type ThemePair = Readonly<{
  foreground: ThemeToken;
  background: ThemeToken;
  /** A translucent fill over `background`, as the web app paints it. */
  tint?: ThemeTint;
  /** Checked only for themes of this scheme; both when absent. */
  scheme?: ThemeScheme;
  kind: ContrastKind;
}>;

const surfaces = ['background', 'plot', 'muted'] as const;
const textOnSurfaces = [
  'foreground',
  'muted-foreground',
  'today-text',
  'over',
  'positive',
  'negative',
] as const;

export const THEME_PAIRS: readonly ThemePair[] = [
  ...textOnSurfaces.flatMap((foreground) =>
    surfaces.map((background): ThemePair => ({
      foreground,
      background,
      kind: 'text',
    })),
  ),
  { foreground: 'primary-foreground', background: 'primary', kind: 'text' },
  { foreground: 'destructive', background: 'background', kind: 'text' },
  // v1 destructive buttons were outline buttons with destructive text,
  // filled in the dark scheme with `input` at 30%, and at 50% on hover.
  // The web app has since moved to roles; v1 bodies are still checked
  // against the buttons they were made for.
  ...[0.3, 0.5].map((alpha): ThemePair => ({
    foreground: 'destructive',
    background: 'background',
    tint: { token: 'input', alpha },
    scheme: 'dark',
    kind: 'text',
  })),
  // The hero figure on Today is large text.
  { foreground: 'today', background: 'background', kind: 'large-text' },
  // A selected segment (theme mode, entry kind) is filled with primary.
  { foreground: 'primary', background: 'background', kind: 'non-text' },
  { foreground: 'input', background: 'background', kind: 'non-text' },
  { foreground: 'ring', background: 'background', kind: 'non-text' },
  { foreground: 'ring', background: 'plot', kind: 'non-text' },
];
