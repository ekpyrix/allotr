import { currencyCode, money, parseRate } from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { convertOn, totalOn } from './rates.ts';
import { day, usd } from './testing.ts';
import type { ExchangeRate } from './types.ts';

const eur = currencyCode('EUR');
const jpy = currencyCode('JPY');

function rate(
  base: string,
  quote: string,
  value: string,
  asOf: string,
): ExchangeRate {
  return {
    base: currencyCode(base),
    quote: currencyCode(quote),
    rate: parseRate(value),
    asOf: day(asOf),
  };
}

describe('convertOn', () => {
  const rates = [
    rate('EUR', 'USD', '1.10', '2026-03-01'),
    rate('EUR', 'USD', '1.20', '2026-03-10'),
    rate('USD', 'JPY', '150', '2026-03-01'),
  ];

  it('leaves the same currency alone', () => {
    expect(convertOn([], money(123, 'USD'), usd, day('2026-03-01'))).toEqual(
      money(123, 'USD'),
    );
  });

  it('uses the latest rate on or before the day', () => {
    const euros = money(10000, 'EUR');
    expect(convertOn(rates, euros, usd, day('2026-03-09'))).toEqual(
      money(11000, 'USD'),
    );
    expect(convertOn(rates, euros, usd, day('2026-03-10'))).toEqual(
      money(12000, 'USD'),
    );
  });

  it('uses a rate quoted the other way round', () => {
    expect(
      convertOn(rates, money(1500, 'JPY'), usd, day('2026-03-05')),
    ).toEqual(money(1000, 'USD'));
    expect(
      convertOn(rates, money(1200, 'USD'), eur, day('2026-03-10')),
    ).toEqual(money(1000, 'EUR'));
  });

  it('prefers a direct quote on the same day', () => {
    const both = [
      rate('USD', 'EUR', '0.5', '2026-03-10'),
      rate('EUR', 'USD', '1.25', '2026-03-10'),
    ];
    expect(convertOn(both, money(1000, 'USD'), eur, day('2026-03-10'))).toEqual(
      money(500, 'EUR'),
    );
  });

  it('gives null without a rate, never a guess', () => {
    expect(
      convertOn(rates, money(100, 'EUR'), usd, day('2026-02-28')),
    ).toBeNull();
    expect(
      convertOn(rates, money(100, 'EUR'), jpy, day('2026-03-10')),
    ).toBeNull();
  });
});

describe('totalOn', () => {
  const rates = [
    rate('EUR', 'USD', '1.10', '2026-03-01'),
    rate('USD', 'JPY', '150', '2026-03-01'),
  ];
  const on = day('2026-03-05');

  it('sums each currency before converting it once', () => {
    // 0.05 EUR twice converts to 0.11 USD; converted one by one it would
    // round to 0.06 + 0.06.
    expect(
      totalOn(
        rates,
        [money(5, 'EUR'), money(5, 'EUR'), money(1000, 'USD')],
        usd,
        on,
      ),
    ).toEqual({ amount: money(1011, 'USD'), missingRates: [] });
  });

  it('leaves out and reports currencies without a rate', () => {
    expect(
      totalOn(
        rates,
        [money(100, 'GBP'), money(1000, 'USD'), money(100, 'CHF')],
        usd,
        on,
      ),
    ).toEqual({ amount: money(1000, 'USD'), missingRates: ['CHF', 'GBP'] });
  });

  it('needs no rate for a currency that sums to zero', () => {
    expect(
      totalOn([], [money(100, 'GBP'), money(-100, 'GBP')], usd, on),
    ).toEqual({ amount: money(0, 'USD'), missingRates: [] });
  });

  it('is zero in the target currency with nothing to add', () => {
    expect(totalOn(rates, [], eur, on)).toEqual({
      amount: money(0, 'EUR'),
      missingRates: [],
    });
  });

  it('does not depend on the order of the amounts', () => {
    const amountArb = fc
      .tuple(
        fc.integer({ min: -1e9, max: 1e9 }),
        fc.constantFrom('USD', 'EUR', 'JPY', 'GBP'),
      )
      .map(([minor, currency]) => money(minor, currency));
    fc.assert(
      fc.property(fc.array(amountArb, { maxLength: 20 }), (amounts) => {
        const reversed = [...amounts].reverse();
        expect(totalOn(rates, reversed, usd, on)).toEqual(
          totalOn(rates, amounts, usd, on),
        );
      }),
    );
  });
});
