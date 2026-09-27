import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { currencyCode, minorUnit } from './currency.ts';
import { money } from './money.ts';
import { convert, impliedRate, parseRate, type Rate } from './rate.ts';
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
