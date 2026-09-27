import { contrastRatio } from './color.ts';
import {
  CONTRAST_MINIMUM,
  THEME_PAIRS,
  type ThemePair,
  type ThemeTokens,
} from './tokens.ts';

export type ContrastFailure = ThemePair &
  Readonly<{ ratio: number; required: number }>;

/** The declared pairs that fail WCAG 2.2 AA, in THEME_PAIRS order. */
export function validateTheme(tokens: ThemeTokens): ContrastFailure[] {
  return THEME_PAIRS.flatMap((pair) => {
    const ratio = contrastRatio(
      tokens[pair.foreground],
      tokens[pair.background],
    );
    const required = CONTRAST_MINIMUM[pair.kind];
    return ratio < required ? [{ ...pair, ratio, required }] : [];
  });
}
