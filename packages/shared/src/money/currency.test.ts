import { describe, expect, it } from 'vitest';
import {
  currencies,
  currencyCode,
  isCurrencyCode,
  minorUnit,
} from './currency.ts';
import { errorCode } from './testing.ts';

describe('the ISO 4217 table', () => {
  it('has unique codes with 3-digit numerics and known minor units', () => {
    const codes = currencies.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of currencies) {
      expect(c.numeric).toMatch(/^\d{3}$/);
      expect([0, 2, 3, 4]).toContain(c.minorUnit);
    }
  });

  it.each([
    ['JPY', 0],
    ['USD', 2],
    ['KWD', 3],
    ['CLF', 4],
  ])('gives %s %i minor digits', (code, digits) => {
    expect(minorUnit(currencyCode(code))).toBe(digits);
  });
});

describe('currencyCode', () => {
  it('accepts known codes', () => {
    expect(isCurrencyCode('EUR')).toBe(true);
    expect(currencyCode('EUR')).toBe('EUR');
  });

  it.each(['XAU', 'usd', 'ABC', ''])('rejects %j', (value) => {
    expect(isCurrencyCode(value)).toBe(false);
    expect(errorCode(() => currencyCode(value))).toBe('currency.unknown');
  });
});
