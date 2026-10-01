import { describe, expect, it } from 'vitest';
import { reformatAmountInput } from './amount-input.ts';

describe('reformatAmountInput', () => {
  it.each([
    ['35', 'USD', 'en-US', '35.00'],
    ['3.5', 'USD', 'en-US', '3.50'],
    ['1,234.5', 'USD', 'en-US', '1234.50'],
    ['35,5', 'EUR', 'de-DE', '35,50'],
    ['1.234,5', 'EUR', 'de-DE', '1234,50'],
    ['35.0', 'JPY', 'en-US', '35'],
    ['35', 'KWD', 'en-US', '35.000'],
    ['-12', 'USD', 'en-US', '-12.00'],
    ['$35', 'USD', 'en-US', '35.00'],
  ])('turns %s in %s (%s) into %s', (text, currency, locale, expected) => {
    expect(reformatAmountInput(text, currency, locale)).toBe(expected);
  });

  it.each(['', '  ', 'abc', '12.345', '1.2.3', '12abc'])(
    'leaves %j as typed',
    (text) => {
      expect(reformatAmountInput(text, 'USD', 'en-US')).toBe(text);
    },
  );

  it('leaves the text alone before a currency is known', () => {
    expect(reformatAmountInput('35', undefined, 'en-US')).toBe('35');
    expect(reformatAmountInput('35', '', 'en-US')).toBe('35');
  });
});
