import {
  formatContrastRatio,
  type ContrastFailure,
  type ThemeToken,
} from '@allotr/shared';
import { t } from '@/messages/t';

export function tokenLabel(token: ThemeToken): string {
  return t(`themes.tokens.${token}`);
}

/** "Focus ring on Panel: 1.00:1, needs 3:1" */
export function pairText(
  pair: Pick<
    ContrastFailure,
    'foreground' | 'background' | 'ratio' | 'required'
  >,
): string {
  return t('themes.pair', {
    foreground: tokenLabel(pair.foreground),
    background: tokenLabel(pair.background),
    ratio: formatContrastRatio(pair.ratio),
    required: pair.required,
  });
}
