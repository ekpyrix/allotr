import { money } from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatMoney, formatMoneyShort, formatSigned } from './format-money.ts';

// Intl separates a code from the number with a no-break space.
const plain = (text: string) => text.replaceAll(' ', ' ');

describe('formatMoney', () => {
  it.each([
    [1250, 'USD', '$12.50'],
    [1800, 'EUR', '€18.00'],
    [1200, 'JPY', '¥1,200'],
    [1234567, 'KWD', 'KWD 1,234.567'],
    [0, 'USD', '$0.00'],
    [-1400, 'USD', '-$14.00'],
    [5, 'USD', '$0.05'],
    [5, 'KWD', 'KWD 0.005'],
  ])('shows %i %s as %s by symbol', (minor, currency, text) => {
    expect(plain(formatMoney(money(minor, currency)))).toBe(text);
  });

  it('shows the ISO code in code mode', () => {
    expect(plain(formatMoney(money(1250, 'USD'), 'code'))).toBe('USD 12.50');
    expect(plain(formatMoney(money(1200, 'JPY'), 'code'))).toBe('JPY 1,200');
  });

  it('shows the symbol only for the home currency in symbol-foreign mode', () => {
    const usd = money(1250, 'USD');
    const eur = money(1800, 'EUR');
    expect(plain(formatMoney(usd, 'symbol-foreign', 'en', 'USD'))).toBe(
      '$12.50',
    );
    expect(plain(formatMoney(eur, 'symbol-foreign', 'en', 'USD'))).toBe(
      'EUR 18.00',
    );
  });

  it('is exact at the largest safe amount', () => {
    const big = money(Number.MAX_SAFE_INTEGER, 'USD');
    expect(formatMoney(big)).toBe('$90,071,992,547,409.91');
  });
});

describe('formatSigned', () => {
  it('uses a real minus sign and an explicit plus', () => {
    expect(formatSigned(money(-1400, 'USD'))).toBe('−$14.00');
    expect(formatSigned(money(214000, 'USD'))).toBe('+$2,140.00');
  });

  it('gives zero no sign', () => {
    expect(formatSigned(money(0, 'USD'))).toBe('$0.00');
  });
});

describe('formatMoneyShort', () => {
  it('abbreviates large amounts and leaves small ones', () => {
    expect(formatMoneyShort(money(150000, 'USD'))).toBe('$1.5k');
    expect(formatMoneyShort(money(200000000, 'USD'))).toBe('$2M');
    expect(formatMoneyShort(money(4200, 'USD'))).toBe('$42');
  });
});

describe('digits', () => {
  const digitsFor = { USD: 2, EUR: 2, JPY: 0, KWD: 3 } as const;

  it('carry the minor amount for any currency, with every display mode', () => {
    fc.assert(
      fc.property(
        fc.integer({
          min: -Number.MAX_SAFE_INTEGER,
          max: Number.MAX_SAFE_INTEGER,
        }),
        fc.constantFrom('USD', 'EUR', 'JPY', 'KWD'),
        fc.constantFrom('symbol', 'code', 'symbol-foreign'),
        (minor, currency, mode) => {
          const text = formatMoney(money(minor, currency), mode, 'en', 'USD');
          const digits = text.replace(/\D/g, '');
          const width = digitsFor[currency] + 1;
          expect(digits).toBe(String(Math.abs(minor)).padStart(width, '0'));
          expect(text.includes('-')).toBe(minor < 0);
        },
      ),
    );
  });
});
