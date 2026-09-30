import { money } from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { categoryId } from '../ledger/types.ts';
import { rankTotals } from './ranked.ts';

// Made-up categories and amounts.

const usd = (amountMinor: number) => money(amountMinor, 'USD');
const total = (id: string, amountMinor: number) => ({
  categoryId: categoryId(id),
  amount: usd(amountMinor),
});

describe('rankTotals', () => {
  it('keeps every category when at most one would be folded', () => {
    const totals = [total('a', 500), total('b', 300), total('c', 100)];
    expect(rankTotals(totals, 2)).toEqual({ top: totals, other: null });
    expect(rankTotals(totals, 3)).toEqual({ top: totals, other: null });
  });

  it('folds the rest into one sum with its count', () => {
    const totals = [
      total('a', 500),
      total('b', 300),
      total('c', 100),
      total('d', 40),
    ];
    expect(rankTotals(totals, 2)).toEqual({
      top: totals.slice(0, 2),
      other: { count: 2, amount: usd(140) },
    });
  });

  it('is empty for no totals', () => {
    expect(rankTotals([], 6)).toEqual({ top: [], other: null });
  });

  it('never loses or makes money', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -1_000_000, max: 1_000_000 }), {
          maxLength: 30,
        }),
        fc.integer({ min: 1, max: 10 }),
        (amounts, keep) => {
          const totals = amounts.map((a, i) => total(`c${String(i)}`, a));
          const { top, other } = rankTotals(totals, keep);
          const sum = (xs: readonly { amount: { amountMinor: number } }[]) =>
            xs.reduce((s, x) => s + x.amount.amountMinor, 0);
          expect(sum(top) + (other?.amount.amountMinor ?? 0)).toBe(sum(totals));
          expect(top.length + (other?.count ?? 0)).toBe(totals.length);
          expect(top.length).toBeLessThanOrEqual(keep + 1);
        },
      ),
    );
  });
});
