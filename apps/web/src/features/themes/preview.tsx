import {
  formatMoney,
  money,
  THEME_TOKENS,
  type ThemeToken,
} from '@allotr/shared';
import type { CSSProperties } from 'react';
import { t } from '@/messages/t';
import { pickerValue } from './draft.ts';

// A small copy of the app in the draft's colours. The custom properties are
// set on this box only, so the editor around it stays readable whatever
// the draft holds. It is a picture: the contrast list says the same in
// words, so screen readers skip it and nothing in it takes focus.

const locale = navigator.language;

function amount(minor: number): string {
  return formatMoney(money(minor, 'EUR'), locale);
}

export function ThemePreview({
  tokens,
}: {
  tokens: Readonly<Record<ThemeToken, string>>;
}) {
  const style = Object.fromEntries(
    THEME_TOKENS.map((token) => [`--${token}`, pickerValue(tokens[token])]),
  ) as CSSProperties;
  return (
    <div
      aria-hidden="true"
      data-testid="theme-preview"
      style={style}
      className="rounded-lg border bg-background p-5 text-foreground"
    >
      <p className="text-sm text-muted-foreground">{t('themes.previewHero')}</p>
      <p className="mt-1 text-5xl font-semibold tracking-tight text-today">
        {amount(4250)}
      </p>
      <p className="mt-1 text-sm text-today-text">{t('themes.previewMuted')}</p>
      <ul className="mt-5 divide-y rounded-md bg-plot px-4">
        <li className="flex justify-between gap-4 py-2">
          <span>{t('themes.previewCaption')}</span>
          <span className="text-negative">{amount(-1890)}</span>
        </li>
        <li className="flex justify-between gap-4 py-2">
          <span>{t('themes.previewIncome')}</span>
          <span className="text-positive">{amount(210000)}</span>
        </li>
      </ul>
      <p className="mt-3 rounded-md bg-muted px-4 py-2 text-sm text-over">
        {t('themes.previewOver', { amount: amount(1200) })}
      </p>
      <div className="mt-5 grid gap-2">
        <span className="text-sm font-medium">{t('themes.previewInput')}</span>
        <span className="flex h-11 items-center rounded-md border border-input px-3 ring-2 ring-ring ring-offset-2 ring-offset-background">
          18.90
        </span>
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <span className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
          {t('themes.previewPrimary')}
        </span>
        <span className="inline-flex h-9 items-center rounded-md border border-destructive px-4 text-sm font-medium text-destructive">
          {t('themes.previewDestructive')}
        </span>
      </div>
    </div>
  );
}
