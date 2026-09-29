import { expect, it } from 'vitest';
import {
  formatMoney,
  formatMoneyInput,
  type FormatMoneyOptions,
} from './format.ts';
import { money } from './money.ts';

it.each([
  [1250, 'USD', 'en-US', '$12.50'],
  [-1250, 'USD', 'en-US', '-$12.50'],
  [1200, 'JPY', 'en-US', '¥1,200'],
  [1500, 'KWD', 'en-US', 'KWD 1.500'],
  [1, 'CLF', 'en-US', 'CLF 0.0001'],
  [123456, 'EUR', 'de-DE', '1.234,56 €'],
  [123456789, 'INR', 'hi-IN', '₹12,34,567.89'],
  // Intl's own data shows IRR without decimals; the ISO minor unit wins.
  [12345, 'IRR', 'en-US', 'IRR 123.45'],
  [Number.MAX_SAFE_INTEGER, 'USD', 'en-US', '$90,071,992,547,409.91'],
])('formats %i %s in %s', (amountMinor, currency, locale, expected) => {
  expect(formatMoney(money(amountMinor, currency), locale)).toBe(expected);
});

it('passes display options through', () => {
  const m = money(1250, 'USD');
  expect(formatMoney(m, 'en-US', { currencyDisplay: 'code' })).toBe(
    'USD 12.50',
  );
  expect(formatMoney(m, 'en-US', { currencyDisplay: 'name' })).toBe(
    '12.50 US dollars',
  );
  expect(formatMoney(m, 'en-US', { signDisplay: 'always' })).toBe('+$12.50');
});

it('ignores options it does not declare', () => {
  // A wider object type-checks; it must not leak into the cached formatter.
  const wide = { currencyDisplay: 'code', notation: 'compact' } as const;
  const options: FormatMoneyOptions = wide;
  const m = money(123456789, 'CAD');
  expect(formatMoney(m, 'en-GB', options)).toBe('CAD\u00a01,234,567.89');
  expect(formatMoney(m, 'en-GB', { currencyDisplay: 'code' })).toBe(
    'CAD\u00a01,234,567.89',
  );
});

it.each([
  [-123456, 'USD', 'en-US', '1234.56'],
  [123456, 'EUR', 'de-DE', '1234,56'],
  [1200, 'JPY', 'en-US', '1200'],
  [5, 'BHD', 'en-US', '0.005'],
])('writes %i %s in %s for an input', (amountMinor, currency, locale, text) => {
  expect(formatMoneyInput(money(amountMinor, currency), locale)).toBe(text);
});
