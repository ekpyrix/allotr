import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { money, moneyFromDecimal, moneyToDecimal } from './money.ts';
import { errorCode, moneyArb } from './testing.ts';

describe('money', () => {
  it('holds an integer amount and a currency', () => {
    const m = money(1250, 'USD');
    expect(m).toEqual({ amountMinor: 1250, currency: 'USD' });
    expect(Object.isFrozen(m)).toBe(true);
  });

  it('normalises negative zero', () => {
    expect(Object.is(money(-0, 'USD').amountMinor, 0)).toBe(true);
  });

  it.each([
    [12.5, 'USD', 'money.not_integer'],
    [Number.NaN, 'USD', 'money.not_integer'],
    [Number.POSITIVE_INFINITY, 'USD', 'money.not_integer'],
    [2 ** 53, 'USD', 'money.out_of_range'],
    [100, 'XAU', 'currency.unknown'],
    [100, 'usd', 'currency.unknown'],
  ])('rejects %s %s', (amount, currency, code) => {
    expect(errorCode(() => money(amount, currency))).toBe(code);
  });
});

describe('moneyFromDecimal', () => {
  it.each([
    ['12.50', 'USD', 1250],
    ['12.5', 'USD', 1250],
    ['12.500', 'USD', 1250],
    ['1200', 'JPY', 1200],
    ['1200.00', 'JPY', 1200],
    ['1.500', 'KWD', 1500],
    ['-0.0001', 'CLF', -1],
    ['0', 'USD', 0],
  ])('reads %s %s', (text, currency, amountMinor) => {
    expect(moneyFromDecimal(text, currency)).toEqual(
      money(amountMinor, currency),
    );
  });

  it.each([
    ['12.345', 'USD', 'money.too_many_decimals'],
    ['1.5', 'JPY', 'money.too_many_decimals'],
    ['12,50', 'USD', 'money.invalid_format'],
    ['', 'USD', 'money.invalid_format'],
    ['1e3', 'USD', 'money.invalid_format'],
    ['+5', 'USD', 'money.invalid_format'],
    [' 5', 'USD', 'money.invalid_format'],
    ['12.', 'USD', 'money.invalid_format'],
    ['90071992547409.92', 'USD', 'money.out_of_range'],
    ['5', 'XAU', 'currency.unknown'],
  ])('rejects %j %s', (text, currency, code) => {
    expect(errorCode(() => moneyFromDecimal(text, currency))).toBe(code);
  });
});

describe('moneyToDecimal', () => {
  it.each([
    [1250, 'USD', '12.50'],
    [-5, 'USD', '-0.05'],
    [1200, 'JPY', '1200'],
    [1500, 'KWD', '1.500'],
    [1, 'CLF', '0.0001'],
    [Number.MAX_SAFE_INTEGER, 'USD', '90071992547409.91'],
  ])('writes %i %s as %s', (amountMinor, currency, text) => {
    expect(moneyToDecimal(money(amountMinor, currency))).toBe(text);
  });

  it('round-trips through moneyFromDecimal', () => {
    fc.assert(
      fc.property(moneyArb, (m) => {
        expect(moneyFromDecimal(moneyToDecimal(m), m.currency)).toEqual(m);
      }),
    );
  });
});
