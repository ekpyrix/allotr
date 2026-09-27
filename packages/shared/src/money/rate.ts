import type { z } from 'zod';
import { currencyCode, minorUnit } from './currency.ts';
import { MoneyError } from './errors.ts';
import { money, type Money } from './money.ts';

// An exact exchange rate as a decimal string, never a float (ADR 0010).
// Stored as text in fx_rates.rate and sent as a string in JSON.
export type Rate = string & z.$brand<'Rate'>;

const RATE = /^\d+(\.\d+)?$/;
const MAX_RATE_LENGTH = 40;

export function isRate(value: string): value is Rate {
  return (
    value.length <= MAX_RATE_LENGTH && RATE.test(value) && /[1-9]/.test(value)
  );
}

export function parseRate(value: string): Rate {
  if (!isRate(value)) {
    throw new MoneyError(
      'rate.invalid',
      `"${value}" is not an exchange rate. Use a positive decimal such as 0.915.`,
    );
  }
  return value;
}

// Symmetric round half to even of numerator / denominator (denominator > 0).
function divideHalfEven(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  let quotient = abs / denominator;
  const twice = 2n * (abs % denominator);
  if (twice > denominator || (twice === denominator && quotient % 2n === 1n)) {
    quotient += 1n;
  }
  return negative ? -quotient : quotient;
}

const MAX_MINOR = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * Converts money for reporting. `rate` is how many units of `target` one
 * major unit of `m.currency` buys (0.915 turns USD into EUR). Rounds half to
 * even once, at the target's minor unit (docs/domain.md "Money and currency").
 */
export function convert(m: Money, rate: Rate, target: string): Money {
  const to = currencyCode(target);
  const [integer = '', fraction = ''] = rate.split('.');
  const numerator =
    BigInt(m.amountMinor) *
    BigInt(integer + fraction) *
    10n ** BigInt(minorUnit(to));
  const denominator = 10n ** BigInt(fraction.length + minorUnit(m.currency));
  const result = divideHalfEven(numerator, denominator);
  if (result > MAX_MINOR || result < -MAX_MINOR) {
    throw new MoneyError(
      'money.out_of_range',
      `The converted amount is too large for ${to}.`,
    );
  }
  return money(Number(result), to);
}

const IMPLIED_RATE_DIGITS = 12n;

/**
 * The rate a cross-currency transfer used: units of `received.currency` per
 * unit of `sent.currency`, to 12 significant digits, half to even. It is
 * stored on the transaction for information only (ADR 0010).
 */
export function impliedRate(sent: Money, received: Money): Rate {
  if (sent.amountMinor === 0 || received.amountMinor === 0) {
    throw new MoneyError(
      'rate.invalid',
      'An implied rate needs two non-zero amounts.',
    );
  }
  const numerator =
    BigInt(Math.abs(received.amountMinor)) *
    10n ** BigInt(minorUnit(sent.currency));
  const denominator =
    BigInt(Math.abs(sent.amountMinor)) *
    10n ** BigInt(minorUnit(received.currency));

  // Enough decimal places for 12 significant digits.
  const smallest = denominator * 10n ** (IMPLIED_RATE_DIGITS - 1n);
  let places = 0n;
  while (numerator * 10n ** places < smallest) places += 1n;
  const scaled = divideHalfEven(numerator * 10n ** places, denominator);

  const digits = scaled.toString().padStart(Number(places) + 1, '0');
  const integer = digits.slice(0, digits.length - Number(places));
  const fraction = digits.slice(integer.length).replace(/0+$/, '');
  return parseRate(fraction === '' ? integer : `${integer}.${fraction}`);
}
