import { money } from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { savingsRate } from './savings-rate.ts';

const usd = (n: number) => money(n, 'USD');

describe('savingsRate', () => {
  it('is savings over income in basis points', () => {
    expect(savingsRate(usd(400_000), usd(60_000))).toBe(1500);
    expect(savingsRate(usd(400_000), usd(0))).toBe(0);
  });

  it('is negative when savings fell', () => {
    expect(savingsRate(usd(400_000), usd(-20_000))).toBe(-500);
  });

  it('is null without income', () => {
    expect(savingsRate(usd(0), usd(100))).toBeNull();
  });

  it('rounds half to even', () => {
    // 1 / 800 is 12.5 basis points, 3 / 800 is 37.5.
    expect(savingsRate(usd(800), usd(1))).toBe(12);
    expect(savingsRate(usd(800), usd(3))).toBe(38);
    expect(savingsRate(usd(800), usd(-1))).toBe(-12);
  });

  it('stays within one basis point of the exact ratio', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000_000 }),
        fc.integer({ min: -10_000_000, max: 10_000_000 }),
        (income, saved) => {
          const rate = savingsRate(usd(income), usd(saved));
          expect(
            Math.abs((rate ?? 0) - (saved * 10_000) / income),
          ).toBeLessThanOrEqual(0.5);
        },
      ),
    );
  });
});
