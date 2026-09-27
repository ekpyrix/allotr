import { minorUnit } from './currency.ts';
import { moneyToDecimal, type Money } from './money.ts';

export interface FormatMoneyOptions {
  readonly currencyDisplay?: 'symbol' | 'narrowSymbol' | 'code' | 'name';
  readonly signDisplay?:
    'auto' | 'always' | 'exceptZero' | 'negative' | 'never';
}

const formatters = new Map<string, Intl.NumberFormat>();

// Fraction digits come from the ISO table rather than Intl's own data, and
// the amount goes in as an exact decimal string, never a float.
function formatterFor(
  locale: string,
  m: Money,
  options: FormatMoneyOptions,
): Intl.NumberFormat {
  const key = [
    locale,
    m.currency,
    options.currencyDisplay,
    options.signDisplay,
  ].join('|');
  let formatter = formatters.get(key);
  if (formatter === undefined) {
    const digits = minorUnit(m.currency);
    formatter = new Intl.NumberFormat(locale, {
      ...options,
      style: 'currency',
      currency: m.currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    formatters.set(key, formatter);
  }
  return formatter;
}

/** Formats money for display, for example "$12.50" or "1.234,56 €". */
export function formatMoney(
  m: Money,
  locale: string,
  options: FormatMoneyOptions = {},
): string {
  return formatterFor(locale, m, options).format(moneyToDecimal(m));
}
