import * as React from 'react';
import { formatMoney, type Money } from '@allotr/shared';
import { ArrowDown, ArrowLeftRight, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toneClass, valueTone, type ValueKind } from '@/lib/value-tone';

// An amount with value colour (ADR 0022): mono tabular figures, the text
// coloured by sign (or blue for a transfer), the sign kept in the text and
// an arrow beside it. `plain` shows no colour and no arrow, for an amount
// that has no direction (a balance, a budget).

function Amount({
  amount,
  locale,
  kind,
  signDisplay,
  plain = false,
  negativeOnly = false,
  muted = false,
  className,
}: {
  amount: Money;
  locale: string;
  kind?: ValueKind;
  /** Defaults to the sign for a direction and none for a transfer. */
  signDisplay?: 'auto' | 'never' | 'always' | 'exceptZero';
  plain?: boolean;
  /** For a balance: only a negative one is coloured and given an arrow. */
  negativeOnly?: boolean;
  /** Greyed, for an undone entry: the colour is dropped, the arrow stays. */
  muted?: boolean;
  className?: string;
}) {
  const raw = valueTone(amount.amountMinor, kind);
  const tone = negativeOnly && raw !== 'negative' ? 'neutral' : raw;
  const text = formatMoney(amount, locale, {
    signDisplay:
      signDisplay ??
      (kind === 'transfer' ? 'never' : negativeOnly ? 'auto' : 'exceptZero'),
  });
  const Arrow =
    kind === 'transfer'
      ? ArrowLeftRight
      : tone === 'positive'
        ? ArrowUp
        : tone === 'negative'
          ? ArrowDown
          : null;
  return (
    <span
      data-slot="amount"
      data-tone={plain ? 'neutral' : tone}
      className={cn(
        'inline-flex items-center justify-end gap-1 font-mono tabular-nums',
        plain ? 'text-text' : muted ? 'text-text-muted' : toneClass[tone],
        className,
      )}
    >
      {plain || Arrow === null ? null : (
        <Arrow aria-hidden="true" className="size-3.5 shrink-0 stroke-2" />
      )}
      {text}
    </span>
  );
}

export { Amount };
