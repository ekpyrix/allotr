import { describe, expect, it } from 'vitest';
import type { CurrencyCode } from './currency.ts';
import { currencyCodeSchema } from './schemas.ts';

describe('currencyCodeSchema', () => {
  it('outputs a branded code', () => {
    const code: CurrencyCode = currencyCodeSchema.parse('KWD');
    expect(code).toBe('KWD');
  });

  it.each(['usd', 'XAU', 'US', 42])('rejects %j', (value) => {
    expect(currencyCodeSchema.safeParse(value).success).toBe(false);
  });
});
