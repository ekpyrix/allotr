import { money, type Money } from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { expense, income, transfer } from '../ledger/build.ts';
import { food, meta, salary, testCurrencies } from '../ledger/testing.ts';
import { accountId, categoryId, type Transaction } from '../ledger/types.ts';
import { entryGroupTotals, entryTotals } from './entry-totals.ts';
import { chart, spend } from './testing.ts';

// For any set of entries: net = income - spent per currency, the groups'
// spent, income and net add up to the set's whatever the grouping, a day
// grouping's counts add up to the count, and transfers never change a
// figure. fast-check prints the seed of any failure.

const rent = categoryId('rent');
const day = fc
  .integer({ min: 1, max: 10 })
  .map((n) => `2026-04-${String(n).padStart(2, '0')}`);
const currency = fc.constantFrom(...testCurrencies);
const amount = fc.integer({ min: 1, max: 500_000 });

const entryArb: fc.Arbitrary<Transaction> = fc.oneof(
  fc
    .record({
      on: day,
      c: currency,
      n: amount,
      cat: fc.constantFrom(food, rent),
    })
    .map(({ on, c, n, cat }) => spend(on, n, cat, accountId(`card-${c}`))),
  fc.record({ on: day, c: currency, n: amount }).map(({ on, c, n }) =>
    income(chart, meta(on), {
      accountId: accountId(`card-${c}`),
      amount: money(n, c),
      categoryId: salary,
    }),
  ),
  fc.record({ on: day, c: currency, n: amount }).map(({ on, c, n }) =>
    transfer(chart, meta(on), {
      fromId: accountId(`card-${c}`),
      toId: accountId(`savings-${c}`),
      sent: money(n, c),
      received: money(n, c),
    }),
  ),
  fc
    .record({ on: day, c: currency, a: amount, b: amount })
    .map(({ on, c, a, b }) =>
      expense(chart, meta(on), {
        accountId: accountId(`card-${c}`),
        amount: money(a + b, c),
        lines: [
          { categoryId: food, amount: money(a, c) },
          { categoryId: rent, amount: money(b, c) },
        ],
      }),
    ),
);
const entriesArb = fc.array(entryArb, { maxLength: 25 });

type Figures = Map<string, { spent: number; income: number; net: number }>;
function figures(
  rows: readonly {
    byCurrency: readonly { spent: Money; income: Money; net: Money }[];
  }[],
): Figures {
  const out: Figures = new Map();
  for (const row of rows) {
    for (const t of row.byCurrency) {
      const key = t.spent.currency;
      const sum = out.get(key) ?? { spent: 0, income: 0, net: 0 };
      sum.spent += t.spent.amountMinor;
      sum.income += t.income.amountMinor;
      sum.net += t.net.amountMinor;
      out.set(key, sum);
    }
  }
  return out;
}

describe('entry totals properties', () => {
  it('net is income minus spent in every currency', () => {
    fc.assert(
      fc.property(entriesArb, (entries) => {
        for (const t of entryTotals(chart, entries).byCurrency) {
          expect(t.net.amountMinor).toBe(
            t.income.amountMinor - t.spent.amountMinor,
          );
          expect(t.net.currency).toBe(t.spent.currency);
          expect(t.income.currency).toBe(t.spent.currency);
        }
      }),
    );
  });

  it.each(['day', 'category'] as const)(
    'groups by %s add up to the set',
    (grouping) => {
      fc.assert(
        fc.property(entriesArb, (entries) => {
          const whole = entryTotals(chart, entries);
          const groups = entryGroupTotals(chart, entries, grouping);
          expect(figures(groups)).toEqual(figures([whole]));
          if (grouping === 'day') {
            expect(groups.reduce((n, g) => n + g.count, 0)).toBe(whole.count);
          }
        }),
      );
    },
  );

  it('ignores transfers and does not depend on order', () => {
    fc.assert(
      fc.property(entriesArb, (entries) => {
        const moving = entries.filter((e) => e.kind !== 'transfer');
        expect(figures([entryTotals(chart, entries)])).toEqual(
          figures([entryTotals(chart, moving)]),
        );
        expect(entryTotals(chart, [...entries].reverse())).toEqual(
          entryTotals(chart, entries),
        );
      }),
    );
  });
});
