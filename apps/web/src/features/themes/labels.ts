import {
  formatContrastRatio,
  type ContrastFailure,
  type ThemePair,
  type ThemeToken,
} from '@allotr/shared';
import { t } from '@/messages/t';

export function tokenLabel(token: ThemeToken): string {
  return t(`themes.tokens.${token}`);
}

/** "Panel", or "Input outline 50% over Page background" for a tint. */
export function surfaceLabel(
  pair: Pick<ThemePair, 'background' | 'tint'>,
): string {
  const background = tokenLabel(pair.background);
  return pair.tint === undefined
    ? background
    : t('themes.tinted', {
        tint: tokenLabel(pair.tint.token),
        percent: Math.round(pair.tint.alpha * 100),
        background,
      });
}

/** Tells pairs apart when two share both tokens. */
export function pairKey(
  pair: Pick<ThemePair, 'foreground' | 'background' | 'tint'>,
): string {
  const tint =
    pair.tint === undefined
      ? ''
      : `/${pair.tint.token}@${String(pair.tint.alpha)}`;
  return `${pair.foreground}/${pair.background}${tint}`;
}

/** "Focus ring on Panel: 1.00:1, needs 3:1" */
export function pairText(
  pair: Pick<
    ContrastFailure,
    'foreground' | 'background' | 'tint' | 'ratio' | 'required'
  >,
): string {
  return t('themes.pair', {
    foreground: tokenLabel(pair.foreground),
    background: surfaceLabel(pair),
    ratio: formatContrastRatio(pair.ratio),
    required: pair.required,
  });
}
