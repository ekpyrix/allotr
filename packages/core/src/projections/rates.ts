import {
  convert,
  convertInverse,
  type CurrencyCode,
  type LocalDate,
  type Money,
} from '@allotr/shared';
import type { ExchangeRate } from './types.ts';

// Picks the rate for a figure's day (ADR 0010): the latest one dated on or
// before it, quoted either way round. A missing rate gives null and the
// caller flags the currency; a rate is never guessed.

function later(a: ExchangeRate, b: ExchangeRate): number {
  return b.asOf.localeCompare(a.asOf);
}

export function convertOn(
  rates: readonly ExchangeRate[],
  amount: Money,
  target: CurrencyCode,
  date: LocalDate,
): Money | null {
  if (amount.currency === target) return amount;
  // A direct quote wins over an inverse one of the same day.
  const [best] = rates
    .filter(
      (r) =>
        r.asOf <= date &&
        ((r.base === amount.currency && r.quote === target) ||
          (r.base === target && r.quote === amount.currency)),
    )
    .sort(
      (a, b) =>
        later(a, b) ||
        Number(b.base === amount.currency) - Number(a.base === amount.currency),
    );
  if (best === undefined) return null;
  return best.base === amount.currency
    ? convert(amount, best.rate, target)
    : convertInverse(amount, best.rate, target);
}
