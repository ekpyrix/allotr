import { describe, expect, it } from 'vitest';
import type { CurrencyCode } from './currency.ts';
import type { Money } from './money.ts';
import type { Rate } from './rate.ts';
import { currencyCodeSchema, moneySchema, rateSchema } from './schemas.ts';

describe('currencyCodeSchema', () => {
  it('outputs a branded code', () => {
    const code: CurrencyCode = currencyCodeSchema.parse('KWD');
    expect(code).toBe('KWD');
  });

  it.each(['usd', 'XAU', 'US', 42])('rejects %j', (value) => {
    expect(currencyCodeSchema.safeParse(value).success).toBe(false);
  });
});

describe('moneySchema', () => {
  it('outputs branded money', () => {
    const m: Money = moneySchema.parse({ amountMinor: 1500, currency: 'KWD' });
    expect(m).toEqual({ amountMinor: 1500, currency: 'KWD' });
  });

  it.each([
    { amountMinor: 12.5, currency: 'USD' },
    { amountMinor: 2 ** 53, currency: 'USD' },
    { amountMinor: '1250', currency: 'USD' },
    { amountMinor: 1250, currency: 'XAU' },
    { amountMinor: 1250 },
  ])('rejects %j', (value) => {
    expect(moneySchema.safeParse(value).success).toBe(false);
  });
});

describe('rateSchema', () => {
  it('outputs a branded rate', () => {
    const rate: Rate = rateSchema.parse('0.915');
    expect(rate).toBe('0.915');
  });

  it.each(['0', '-1', '1e3', 0.915])('rejects %j', (value) => {
    expect(rateSchema.safeParse(value).success).toBe(false);
  });
});
