import type { Money } from '@allotr/shared';
import { formatMoney, type CurrencyDisplay } from '@/lib/format-money';
import { toneClass, valueTone } from '@/lib/value-tone';
import { cn } from '@/lib/utils';

// An amount in the number font (docs/ui.md §4). The sign and an arrow always
// come with the colour, so meaning never rests on colour alone (principle 9).
// It formats what the server produced; it never adds or converts.

export type AmountKind = 'expense' | 'income' | 'transfer' | 'plain';

const ARROW: Record<AmountKind, string> = {
  expense: '↓',
  income: '↑',
  transfer: '↔',
  plain: '',
};

export function Amount({
  amount,
  kind = 'plain',
  mode = 'symbol',
  locale,
  className,
}: {
  /** Signed as stored: expenses negative, income positive. */
  amount: Money;
  kind?: AmountKind;
  mode?: CurrencyDisplay;
  locale?: string;
  className?: string;
}) {
  const negative = amount.amountMinor < 0;
  const shown = kind === 'plain' ? amount : { ...amount };
  const text =
    kind === 'income' && !negative
      ? `+${formatMoney(shown, mode, locale)}`
      : formatMoney(shown, mode, locale).replace('-', '−');
  const tone =
    kind === 'plain'
      ? 'neutral'
      : valueTone(
          amount.amountMinor,
          kind === 'transfer' ? 'transfer' : undefined,
        );
  return (
    <span
      className={cn(
        'whitespace-nowrap font-num tabular-nums',
        kind === 'plain' ? '' : toneClass[tone],
        className,
      )}
    >
      {ARROW[kind] === '' ? null : (
        <span aria-hidden="true">{ARROW[kind]} </span>
      )}
      {text}
    </span>
  );
}
