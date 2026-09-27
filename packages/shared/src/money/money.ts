import type { z } from 'zod';
import { currencyCode, minorUnit, type CurrencyCode } from './currency.ts';
import { MoneyError } from './errors.ts';

// An amount in integer minor units plus its currency (docs/domain.md
// "Money and currency"). Build it with `money` or `moneySchema` only.
export type Money = Readonly<{
  amountMinor: number;
  currency: CurrencyCode;
}> &
  z.$brand<'Money'>;

export function money(amountMinor: number, currency: string): Money {
  const code = currencyCode(currency);
  if (!Number.isInteger(amountMinor)) {
    throw new MoneyError(
      'money.not_integer',
      `Amount ${String(amountMinor)} is not a whole number of minor units.`,
    );
  }
  if (!Number.isSafeInteger(amountMinor)) {
    throw new MoneyError(
      'money.out_of_range',
      `Amount ${String(amountMinor)} is too large.`,
    );
  }
  // -0 would make equal amounts compare unequal.
  return Object.freeze({
    amountMinor: amountMinor === 0 ? 0 : amountMinor,
    currency: code,
  }) as Money;
}

const MAX_MINOR = BigInt(Number.MAX_SAFE_INTEGER);

// Builds money from ASCII digit strings. Extra fraction digits must be
// zeros: parsing never rounds what the user wrote.
export function moneyFromDigits(
  negative: boolean,
  integer: string,
  fraction: string,
  currency: CurrencyCode,
): Money {
  const digits = minorUnit(currency);
  if (/[1-9]/.test(fraction.slice(digits))) {
    throw new MoneyError(
      'money.too_many_decimals',
      digits === 0
        ? `${currency} amounts have no decimal places.`
        : `${currency} amounts have at most ${String(digits)} decimal places.`,
    );
  }
  const minor = BigInt(integer + fraction.slice(0, digits).padEnd(digits, '0'));
  if (minor > MAX_MINOR) {
    throw new MoneyError(
      'money.out_of_range',
      `The amount is too large for ${currency}.`,
    );
  }
  return money(Number(negative ? -minor : minor), currency);
}

const DECIMAL = /^(-)?(\d+)(?:\.(\d+))?$/;

/** Reads a plain decimal such as "-12.50" (imports, the chat grammar). */
export function moneyFromDecimal(text: string, currency: string): Money {
  const code = currencyCode(currency);
  const match = DECIMAL.exec(text);
  if (match === null) {
    throw new MoneyError(
      'money.invalid_format',
      `"${text}" is not a decimal amount such as 12.50.`,
    );
  }
  const [, sign, integer = '', fraction = ''] = match;
  return moneyFromDigits(sign === '-', integer, fraction, code);
}

/** Writes the exact plain decimal, such as "-12.50" or "1200". */
export function moneyToDecimal(m: Money): `${number}` {
  const digits = minorUnit(m.currency);
  const sign = m.amountMinor < 0 ? '-' : '';
  const abs = String(Math.abs(m.amountMinor)).padStart(digits + 1, '0');
  const text =
    digits === 0 ? abs : `${abs.slice(0, -digits)}.${abs.slice(-digits)}`;
  return `${sign}${text}` as `${number}`;
}
