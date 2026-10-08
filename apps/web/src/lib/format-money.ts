import {
  formatMoney as formatSharedMoney,
  formatMoneyCompact,
  type Money,
} from '@allotr/shared';

// Display formatting for amounts (docs/ui.md §5.1). Every amount in the web
// app goes through here. It only formats: it never adds, converts or rounds
// an amount to show a total. Exact decimals and ISO 4217 minor digits come
// from @allotr/shared.

/**
 * How the currency shows: its symbol (default), its ISO code, or the symbol
 * for the home currency and the code for any other.
 */
export type CurrencyDisplay = 'symbol' | 'code' | 'symbol-foreign';

const MINUS = '−';

function intlDisplay(
  amount: Money,
  mode: CurrencyDisplay,
  home: string | undefined,
): 'narrowSymbol' | 'code' {
  if (mode === 'symbol') return 'narrowSymbol';
  if (mode === 'code') return 'code';
  return amount.currency === home ? 'narrowSymbol' : 'code';
}

/** "$12.50", "USD 12.50" or, in `symbol-foreign` mode, by comparison with `home`. */
export function formatMoney(
  amount: Money,
  mode: CurrencyDisplay = 'symbol',
  locale = 'en',
  home?: string,
): string {
  return formatSharedMoney(amount, locale, {
    currencyDisplay: intlDisplay(amount, mode, home),
  });
}

/**
 * The amount with an explicit sign: "+$2,140.00", "−$14.00" (a real minus
 * sign). Zero has no sign.
 */
export function formatSigned(
  amount: Money,
  mode: CurrencyDisplay = 'symbol',
  locale = 'en',
  home?: string,
): string {
  return formatSharedMoney(amount, locale, {
    currencyDisplay: intlDisplay(amount, mode, home),
    signDisplay: 'exceptZero',
  }).replace('-', MINUS);
}

/**
 * A short axis label such as "$1.5k". It rounds, so it never stands in for
 * an amount.
 */
export function formatMoneyShort(amount: Money, locale = 'en'): string {
  return formatMoneyCompact(amount, locale).replace(/(\d)K/, '$1k');
}
