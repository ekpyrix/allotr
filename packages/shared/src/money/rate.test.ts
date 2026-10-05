import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { currencyCode, minorUnit } from './currency.ts';
import { money } from './money.ts';
import {
  convert,
  convertInverse,
  impliedRate,
  parseRate,
  type Rate,
} from './rate.ts';
import { currencyArb, errorCode } from './testing.ts';

describe('parseRate', () => {
  it.each(['1', '0.915', '1.10', '150.25', '0.00000001'])(
    'accepts %s',
    (text) => {
      expect(parseRate(text)).toBe(text);
    },
  );

  it.each(['0', '0.000', '-1', '1e3', '.5', '1.', ' 1', 'NaN', '1'.repeat(41)])(
    'rejects %j',
    (text) => {
      expect(errorCode(() => parseRate(text))).toBe('rate.invalid');
    },
  );
});

describe('convert', () => {
  it('converts between minor units', () => {
    expect(convert(money(10000, 'USD'), parseRate('0.915'), 'EUR')).toEqual(
      money(9150, 'EUR'),
    );
    expect(convert(money(1250, 'USD'), parseRate('150.25'), 'JPY')).toEqual(
      money(1878, 'JPY'),
    );
    expect(convert(money(1200, 'JPY'), parseRate('0.002'), 'KWD')).toEqual(
      money(2400, 'KWD'),
    );
  });

  it.each([
    ['0.005', 0],
    ['0.015', 2],
    ['0.025', 2],
    ['0.035', 4],
  ])('rounds 1 JPY at %s USD/JPY half to even (%i cents)', (rate, cents) => {
    expect(convert(money(1, 'JPY'), parseRate(rate), 'USD').amountMinor).toBe(
      cents,
    );
    expect(convert(money(-1, 'JPY'), parseRate(rate), 'USD').amountMinor).toBe(
      cents === 0 ? 0 : -cents,
    );
  });

  it('rejects results beyond the safe range and unknown targets', () => {
    const big = money(Number.MAX_SAFE_INTEGER, 'USD');
    expect(errorCode(() => convert(big, parseRate('2'), 'EUR'))).toBe(
      'money.out_of_range',
    );
    expect(errorCode(() => convert(big, parseRate('2'), 'XAU'))).toBe(
      'currency.unknown',
    );
  });

  const rateArb = fc
    .tuple(fc.integer({ min: 0, max: 999 }), fc.stringMatching(/^\d{0,8}$/))
    .map(([i, f]) => (f === '' ? String(i) : `${String(i)}.${f}`))
    .filter((r) => /[1-9]/.test(r))
    .map(parseRate);
  const amountArb = fc.integer({ min: -1e8, max: 1e8 });

  // The exact conversion as numerator / denominator.
  const exact = (amount: number, rate: Rate, from: string, to: string) => {
    const [i = '', f = ''] = rate.split('.');
    const numerator =
      BigInt(amount) *
      BigInt(i + f) *
      10n ** BigInt(minorUnit(currencyCode(to)));
    const denominator = 10n ** BigInt(f.length + minorUnit(currencyCode(from)));
    return { numerator, denominator };
  };

  it('stays within half a minor unit and ties to even', () => {
    fc.assert(
      fc.property(
        amountArb,
        rateArb,
        currencyArb,
        currencyArb,
        (amount, rate, from, to) => {
          const result = convert(money(amount, from), rate, to);
          expect(Number.isSafeInteger(result.amountMinor)).toBe(true);
          expect(result.currency).toBe(to);
          const { numerator, denominator } = exact(amount, rate, from, to);
          const error = numerator - BigInt(result.amountMinor) * denominator;
          const twice = 2n * (error < 0n ? -error : error);
          expect(twice <= denominator).toBe(true);
          if (twice === denominator)
            expect(Math.abs(result.amountMinor) % 2).toBe(0);
        },
      ),
    );
  });

  it('is the identity at rate 1 between currencies with equal minor units', () => {
    fc.assert(
      fc.property(fc.maxSafeInteger(), (amount) => {
        expect(convert(money(amount, 'USD'), parseRate('1'), 'EUR')).toEqual(
          money(amount, 'EUR'),
        );
      }),
    );
  });
});

describe('convertInverse', () => {
  it('divides by a rate quoted the other way round', () => {
    // 1 EUR buys 1.25 USD, so $100.00 is €80.00.
    expect(
      convertInverse(money(10000, 'USD'), parseRate('1.25'), 'EUR'),
    ).toEqual(money(8000, 'EUR'));
  });

  it('rounds half to even once, at the target minor unit', () => {
    // 1 USD buys 8 JPY here: ¥4 → $0.50, ¥12 → $1.50, ¥1 → $0.125 → $0.12.
    const rate = parseRate('8');
    expect(convertInverse(money(4, 'JPY'), rate, 'USD')).toEqual(
      money(50, 'USD'),
    );
    expect(convertInverse(money(1, 'JPY'), rate, 'USD')).toEqual(
      money(12, 'USD'),
    );
    expect(convertInverse(money(3, 'JPY'), rate, 'USD')).toEqual(
      money(38, 'USD'),
    );
    expect(convertInverse(money(-1, 'JPY'), rate, 'USD')).toEqual(
      money(-12, 'USD'),
    );
  });

  it('handles 3-digit currencies', () => {
    // 1 USD buys 0.305 KWD: KWD 3.050 → $10.00.
    expect(
      convertInverse(money(3050, 'KWD'), parseRate('0.305'), 'USD'),
    ).toEqual(money(1000, 'USD'));
  });

  it('agrees with convert when the rate is a power of ten', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1e12, max: 1e12 }),
        fc.constantFrom('0.01', '0.1', '1', '10', '100'),
        (amount, text) => {
          const rate = parseRate(text);
          const inverse = parseRate(String(1 / Number(text)));
          const m = money(amount, 'USD');
          expect(convertInverse(m, rate, 'EUR')).toEqual(
            convert(m, inverse, 'EUR'),
          );
        },
      ),
    );
  });
});

describe('an implied rate as the only rate', () => {
  // A foreign payment leaves the rate it implied (docs/domain.md "Exchange
  // rates"). Reporting with only that rate gives back the paid amount, in
  // either direction, for any amount a person can pay.
  it('converts the foreign amount to the paid amount and back, exactly', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1e9 }),
        fc.integer({ min: 1, max: 1e9 }),
        currencyArb,
        currencyArb,
        (paidMinor, foreignMinor, paidIn, foreignIn) => {
          const paid = money(paidMinor, paidIn);
          const foreign = money(foreignMinor, foreignIn);
          const rate = impliedRate(paid, foreign);
          expect(convert(paid, rate, foreignIn)).toEqual(foreign);
          expect(convertInverse(foreign, rate, paidIn)).toEqual(paid);
        },
      ),
    );
  });
});

describe('impliedRate', () => {
  it.each([
    [money(10000, 'USD'), money(9150, 'EUR'), '0.915'],
    [money(-10000, 'USD'), money(9150, 'EUR'), '0.915'],
    [money(1000, 'USD'), money(1503, 'JPY'), '150.3'],
    [money(1200, 'JPY'), money(2400, 'KWD'), '0.002'],
    [money(300, 'USD'), money(100, 'EUR'), '0.333333333333'],
    [money(200, 'USD'), money(100, 'EUR'), '0.5'],
    [money(700, 'USD'), money(12345678900001, 'JPY'), '1763668414286'],
  ])('gives %o → %o as %s', (sent, received, rate) => {
    expect(impliedRate(sent, received)).toBe(rate);
  });

  it('rejects a zero amount', () => {
    expect(
      errorCode(() => impliedRate(money(0, 'USD'), money(100, 'EUR'))),
    ).toBe('rate.invalid');
  });

  it('converts the sent amount back to within a minor unit of the received', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1e12 }),
        fc.integer({ min: 1, max: 1e12 }),
        currencyArb,
        currencyArb,
        (sentMinor, receivedMinor, from, to) => {
          const sent = money(sentMinor, from);
          const received = money(receivedMinor, to);
          const rate = impliedRate(sent, received);
          expect(parseRate(rate)).toBe(rate);
          const back = convert(sent, rate, to).amountMinor;
          // 12 significant digits keep the error below one part in 10^11.
          const tolerance = 1 + Math.ceil(receivedMinor / 1e11);
          expect(Math.abs(back - receivedMinor)).toBeLessThanOrEqual(tolerance);
        },
      ),
    );
  });
});
