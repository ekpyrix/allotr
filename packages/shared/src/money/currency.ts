import type { z } from 'zod';
import { MoneyError } from './errors.ts';
import iso4217 from './iso4217.json' with { type: 'json' };

// An ISO 4217 code that has a minor unit, from the vendored table
// (ADR 0010). Refresh the table with `pnpm iso4217:refresh`.
export type CurrencyCode = string & z.$brand<'CurrencyCode'>;

export interface Currency {
  readonly code: CurrencyCode;
  readonly numeric: string;
  readonly minorUnit: number;
}

const byCode = new Map<string, Currency>(
  iso4217.currencies.map((c): [string, Currency] => [
    c.code,
    Object.freeze(c as Currency),
  ]),
);

/** Publication date of the ISO 4217 list the table was built from. */
export const iso4217Published: string = iso4217.published;

export const currencies: readonly Currency[] = Object.freeze([
  ...byCode.values(),
]);

export function isCurrencyCode(value: string): value is CurrencyCode {
  return byCode.has(value);
}

function unknownCurrency(value: string): MoneyError {
  return new MoneyError(
    'currency.unknown',
    `Unknown currency code "${value}". Use an ISO 4217 code such as USD.`,
  );
}

export function currencyCode(value: string): CurrencyCode {
  if (!isCurrencyCode(value)) throw unknownCurrency(value);
  return value;
}

/** Digits after the decimal point: 0 for JPY, 2 for USD, 3 for KWD. */
export function minorUnit(currency: CurrencyCode): number {
  const found = byCode.get(currency);
  if (found === undefined) throw unknownCurrency(currency);
  return found.minorUnit;
}
