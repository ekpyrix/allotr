import { currencyCode, money, parseRate } from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { expense } from '../ledger/build.ts';
import { food, meta } from '../ledger/testing.ts';
import { categoryId } from '../ledger/types.ts';
import {
  categoryTotalsBetween,
  rollUpCategories,
  type CategoryNode,
} from './category-summary.ts';
import { chart, day, paycheck, spend, view, wallet } from './testing.ts';

const usd = (amountMinor: number) => money(amountMinor, 'USD');
const fun = categoryId('fun');
const eatingOut = categoryId('eating-out');
const groceries = categoryId('groceries');
const parents = new Map([
  [groceries, food],
  [eatingOut, food],
]);

describe('rollUpCategories', () => {
  it('counts subcategories in their parent, largest first', () => {
    const groups = rollUpCategories(
      [
        { categoryId: groceries, amount: usd(30000) },
        { categoryId: fun, amount: usd(20000) },
        { categoryId: eatingOut, amount: usd(5000) },
      ],
      parents,
    );
    expect(groups.map((g) => [g.categoryId, g.amount.amountMinor])).toEqual([
      [food, 35000],
      [fun, 20000],
    ]);
    expect(groups[0]?.children.map((c) => c.categoryId)).toEqual([
      groceries,
      eatingOut,
    ]);
  });

  it('keeps entries without a category as their own group', () => {
    const [group] = rollUpCategories(
      [{ categoryId: null, amount: usd(100) }],
      parents,
    );
    expect(group).toEqual({
      categoryId: null,
      amount: usd(100),
      children: [],
    });
  });

  it('keeps what was booked on the parent itself as a child', () => {
    const [group] = rollUpCategories(
      [
        { categoryId: food, amount: usd(1000) },
        { categoryId: groceries, amount: usd(2000) },
      ],
      parents,
    );
    expect(group?.amount).toEqual(usd(3000));
    expect(group?.children.map((c) => c.categoryId)).toEqual([groceries, food]);
  });

  it('property: nothing is lost, doubled or reordered wrongly', () => {
    const ids = [food, fun, groceries, eatingOut, null];
    const node = fc.record({
      categoryId: fc.constantFrom(...ids),
      amount: fc.integer({ min: 1, max: 1_000_000 }).map(usd),
    });
    fc.assert(
      fc.property(
        fc.uniqueArray(node, { selector: (n) => n.categoryId ?? '' }),
        (totals: CategoryNode[]) => {
          const groups = rollUpCategories(totals, parents);
          const sum = (xs: readonly CategoryNode[]) =>
            xs.reduce((acc, x) => acc + x.amount.amountMinor, 0);
          expect(sum(groups)).toBe(sum(totals));
          for (const g of groups) {
            if (g.categoryId !== null)
              expect(sum(g.children)).toBe(g.amount.amountMinor);
          }
          const amounts = groups.map((g) => g.amount.amountMinor);
          expect(amounts).toEqual([...amounts].sort((a, b) => b - a));
          const children = groups.flatMap((g) => g.children);
          expect(children.length).toBe(
            totals.filter((t) => t.categoryId !== null).length,
          );
        },
      ),
    );
  });
});

describe('categoryTotalsBetween', () => {
  const ledger = [
    paycheck('2026-03-01', 300000),
    spend('2026-02-27', 700),
    spend('2026-03-03', 4000),
    spend('2026-03-20', 6000, fun),
    spend('2026-04-02', 9000),
  ];
  const range = { from: day('2026-03-01'), to: day('2026-03-31') };

  it('totals only entries dated in the range', () => {
    const { totals } = categoryTotalsBetween(view(ledger), range, 'expenses');
    expect(totals).toEqual([
      { categoryId: fun, amount: usd(6000) },
      { categoryId: food, amount: usd(4000) },
    ]);
  });

  it('totals income with the sign the other way', () => {
    const { totals } = categoryTotalsBetween(view(ledger), range, 'income');
    expect(totals.map((t) => t.amount)).toEqual([usd(300000)]);
  });

  it('counts a merged category as the one it merged into', () => {
    const { totals } = categoryTotalsBetween(
      view(ledger),
      range,
      'expenses',
      new Map([[fun, food]]),
    );
    expect(totals).toEqual([{ categoryId: food, amount: usd(10000) }]);
  });

  it('converts at the rate of the last day and names a missing rate', () => {
    const euro = expense(chart, meta('2026-03-05'), {
      accountId: wallet,
      amount: money(1000, 'EUR'),
      categoryId: fun,
    });
    const without = categoryTotalsBetween(view([euro]), range, 'expenses');
    expect(without.totals).toEqual([]);
    expect(without.missingRates).toEqual(['EUR']);
    const withRate = categoryTotalsBetween(
      view([euro], {
        rates: [
          {
            base: currencyCode('EUR'),
            quote: currencyCode('USD'),
            rate: parseRate('1.10'),
            asOf: day('2026-03-01'),
          },
        ],
      }),
      range,
      'expenses',
    );
    expect(withRate.totals).toEqual([{ categoryId: fun, amount: usd(1100) }]);
  });
});
