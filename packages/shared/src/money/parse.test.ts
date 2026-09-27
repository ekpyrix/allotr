import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatMoney } from './format.ts';
import { money } from './money.ts';
import { parseMoney } from './parse.ts';
import { errorCode, moneyArb } from './testing.ts';

// Chosen to stress the parser: native digits (ar-EG, fa-IR, Thai),
// direction marks, U+2212 minus, narrow no-break space and apostrophe
// groups, and Indian grouping.
const LOCALES = [
  'en-US',
  'de-DE',
  'fr-FR',
  'de-CH',
  'hi-IN',
  'ar-EG',
  'fa-IR',
  'th-TH-u-nu-thai',
  'ja-JP',
];
const DISPLAYS = ['symbol', 'narrowSymbol', 'code', 'name'] as const;

describe('parseMoney', () => {
  it('inverts formatMoney for any currency, amount, locale and display', () => {
    fc.assert(
      fc.property(
        moneyArb,
        fc.constantFrom(...LOCALES),
        fc.constantFrom(...DISPLAYS),
        (m, locale, currencyDisplay) => {
          const text = formatMoney(m, locale, { currencyDisplay });
          expect(parseMoney(text, m.currency, locale)).toEqual(m);
        },
      ),
    );
  });

  it('reads currency names that contain format characters', () => {
    // The Persian name of CVE contains a zero-width non-joiner.
    const m = money(-42894143032400, 'CVE');
    const text = formatMoney(m, 'fa-IR', { currencyDisplay: 'name' });
    expect(parseMoney(text, 'CVE', 'fa-IR')).toEqual(m);
  });

  it('inverts every display option', () => {
    const m = money(-123456, 'USD');
    for (const currencyDisplay of DISPLAYS) {
      for (const signDisplay of ['auto', 'always'] as const) {
        const text = formatMoney(m, 'en-US', { currencyDisplay, signDisplay });
        expect(parseMoney(text, 'USD', 'en-US')).toEqual(m);
      }
    }
  });

  it.each([
    ['12.50', 'USD', 'en-US', 1250],
    ['-$1,234.5', 'USD', 'en-US', -123450],
    ['$ 12', 'USD', 'en-US', 1200],
    ['12.50-', 'USD', 'en-US', -1250],
    ['1.234,56 €', 'EUR', 'de-DE', 123456],
    ['1 234,56', 'EUR', 'fr-FR', 123456],
    ['1’234.50', 'CHF', 'de-CH', 123450],
    ['12,34,567.89', 'INR', 'hi-IN', 123456789],
    ['12.50', 'EGP', 'ar-EG', 1250],
    ['1,234.50', 'EGP', 'ar-EG', 123450],
    ['١٢٫٥٠', 'EGP', 'ar-EG', 1250],
    ['1200.00', 'JPY', 'en-US', 1200],
    ['1.500', 'KWD', 'en-US', 1500],
  ])('reads %j as %s in %s', (text, currency, locale, amountMinor) => {
    expect(parseMoney(text, currency, locale)).toEqual(
      money(amountMinor, currency),
    );
  });

  it.each([
    ['', 'USD', 'en-US', 'money.invalid_format'],
    ['$', 'USD', 'en-US', 'money.invalid_format'],
    ['--12', 'USD', 'en-US', 'money.invalid_format'],
    ['1-2', 'USD', 'en-US', 'money.invalid_format'],
    ['€12', 'USD', 'en-US', 'money.invalid_format'],
    ['EUR 12', 'USD', 'en-US', 'money.invalid_format'],
    ['12 34', 'USD', 'en-US', 'money.invalid_format'],
    ['12.3.4', 'USD', 'en-US', 'money.invalid_format'],
    ['12.345', 'USD', 'en-US', 'money.too_many_decimals'],
    ['1.5', 'JPY', 'en-US', 'money.too_many_decimals'],
    ['$90,071,992,547,409.92', 'USD', 'en-US', 'money.out_of_range'],
    ['12', 'XAU', 'en-US', 'currency.unknown'],
  ])('rejects %j as %s in %s', (text, currency, locale, code) => {
    expect(errorCode(() => parseMoney(text, currency, locale))).toBe(code);
  });

  it.each([
    ['1€234', 'EUR', 'fr-FR'],
    ['12\n345', 'EUR', 'fr-FR'],
    ['12\t345', 'EUR', 'fr-FR'],
    ['USD12USD', 'USD', 'en-US'],
    ['$12$', 'USD', 'en-US'],
  ])(
    'rejects %j: one currency token, only at either end',
    (text, currency, locale) => {
      expect(errorCode(() => parseMoney(text, currency, locale))).toBe(
        'money.invalid_format',
      );
    },
  );

  it.each([
    ['$-12', 'USD', 'en-US', -1200],
    ["CHF-1'234.50", 'CHF', 'de-CH', -123450],
    ['-ریال ۱۲', 'IRR', 'fa-IR', -1200],
  ])(
    'reads a sign on either side of the currency in %j',
    (text, currency, locale, amountMinor) => {
      expect(parseMoney(text, currency, locale)).toEqual(
        money(amountMinor, currency),
      );
    },
  );

  it.each([
    ['1,5', 'USD', 'en-US'],
    ['1,23,4', 'USD', 'en-US'],
    ['12.50', 'EUR', 'de-DE'],
    ['1,234.5', 'EUR', 'de-DE'],
  ])(
    'rejects misplaced group separators in %j (%s, %s)',
    (text, currency, locale) => {
      expect(errorCode(() => parseMoney(text, currency, locale))).toBe(
        'money.invalid_format',
      );
    },
  );
});
