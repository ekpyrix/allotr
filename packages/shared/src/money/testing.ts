import fc from 'fast-check';
import { currencies } from './currency.ts';
import { MoneyError, type MoneyErrorCode } from './errors.ts';
import { money } from './money.ts';

// Test helpers; not exported from the package.

// Returns the MoneyError code thrown by `fn`, or undefined if it returns.
export function errorCode(fn: () => unknown): MoneyErrorCode | undefined {
  try {
    fn();
  } catch (error) {
    if (error instanceof MoneyError) return error.code;
    throw error;
  }
  return undefined;
}

export const currencyArb = fc.constantFrom(...currencies.map((c) => c.code));

// Any safe-integer amount in any currency of the table.
export const moneyArb = fc
  .tuple(fc.maxSafeInteger(), currencyArb)
  .map(([amountMinor, currency]) => money(amountMinor, currency));
