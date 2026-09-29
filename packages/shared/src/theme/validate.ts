import { composite, contrastRatio } from './color.ts';
import {
  CONTRAST_MINIMUM,
  THEME_PAIRS,
  type ThemePair,
  type ThemeScheme,
  type ThemeTokens,
} from './tokens.ts';

export type ContrastFailure = ThemePair &
  Readonly<{ ratio: number; required: number }>;

/** The declared pairs that apply to a theme of this scheme. */
export function themePairs(scheme: ThemeScheme): readonly ThemePair[] {
  return THEME_PAIRS.filter(
    (pair) => pair.scheme === undefined || pair.scheme === scheme,
  );
}

/** The colour a pair's foreground sits on, with any tint laid over. */
export function pairSurface(tokens: ThemeTokens, pair: ThemePair): string {
  const background = tokens[pair.background];
  return pair.tint === undefined
    ? background
    : composite(tokens[pair.tint.token], pair.tint.alpha, background);
}

export function pairRatio(tokens: ThemeTokens, pair: ThemePair): number {
  return contrastRatio(tokens[pair.foreground], pairSurface(tokens, pair));
}

/** The pairs that fail WCAG 2.2 AA for this scheme, in THEME_PAIRS order. */
export function validateTheme(
  tokens: ThemeTokens,
  scheme: ThemeScheme,
): ContrastFailure[] {
  return themePairs(scheme).flatMap((pair) => {
    const ratio = pairRatio(tokens, pair);
    const required = CONTRAST_MINIMUM[pair.kind];
    return ratio < required ? [{ ...pair, ratio, required }] : [];
  });
}
