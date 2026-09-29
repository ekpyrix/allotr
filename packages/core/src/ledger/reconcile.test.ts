import { localDate, money } from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { balanceOf } from './balances.ts';
import { expense, opening } from './build.ts';
import { reconciliation, unrecordedAdjustment } from './reconcile.ts';
import { errorCode, food, meta, salary, testChart } from './testing.ts';
import { accountId, categoryId, type Transaction } from './types.ts';

const chart = testChart();
const card = accountId('card-USD');
const unrecorded = categoryId('unrecorded');
const unrecordedIncome = categoryId('unrecorded-income');
const categories = {
  expenseCategoryId: unrecorded,
  incomeCategoryId: unrecordedIncome,
};

const ledger: Transaction[] = [
  opening(chart, meta('2026-03-01'), {
    accountId: card,
    amount: money(50_000, 'USD'),
  }),
  expense(chart, meta('2026-03-05'), {
    accountId: card,
    amount: money(1_250, 'USD'),
    categoryId: food,
  }),
  expense(chart, meta('2026-03-20'), {
    accountId: card,
    amount: money(3_000, 'USD'),
    categoryId: food,
  }),
];

describe('reconciliation', () => {
  it('compares with the balance at the end of the day', () => {
    const result = reconciliation(chart, ledger, {
      accountId: card,
      stated: money(48_000, 'USD'),
      on: localDate('2026-03-10'),
    });
    expect(result.ledger).toEqual(money(48_750, 'USD'));
    expect(result.difference).toEqual(money(-750, 'USD'));
  });

  it('is zero when the bank matches', () => {
    const result = reconciliation(chart, ledger, {
      accountId: card,
      stated: money(45_750, 'USD'),
      on: localDate('2026-03-31'),
    });
    expect(result.difference.amountMinor).toBe(0);
  });

  it('refuses a balance in another currency', () => {
    expect(
      errorCode(() =>
        reconciliation(chart, ledger, {
          accountId: card,
          stated: money(100, 'EUR'),
          on: localDate('2026-03-10'),
        }),
      ),
    ).toBe('ledger.currency_mismatch');
  });
});

describe('unrecordedAdjustment', () => {
  it('posts a shortfall as an expense', () => {
    const t = unrecordedAdjustment(chart, meta('2026-03-10'), {
      accountId: card,
      difference: money(-750, 'USD'),
      ...categories,
    });
    expect(t.kind).toBe('expense');
    expect(t.categoryId).toBe(unrecorded);
    expect(t.occurredOn).toBe('2026-03-10');
  });

  it('posts a surplus as an income', () => {
    const t = unrecordedAdjustment(chart, meta(), {
      accountId: card,
      difference: money(200, 'USD'),
      ...categories,
    });
    expect(t.kind).toBe('income');
    expect(t.categoryId).toBe(unrecordedIncome);
    expect(t.categoryId).not.toBe(salary);
  });

  it('has nothing to post for a zero difference', () => {
    expect(
      errorCode(() =>
        unrecordedAdjustment(chart, meta(), {
          accountId: card,
          difference: money(0, 'USD'),
          ...categories,
        }),
      ),
    ).toBe('ledger.invalid_amount');
  });

  it('brings the balance on that date to the stated one, debts included', () => {
    const days = Array.from({ length: 31 }, (_, i) =>
      localDate(`2026-03-${String(i + 1).padStart(2, '0')}`),
    );
    fc.assert(
      fc.property(
        fc.constantFrom(...days),
        fc.integer({ min: -1e9, max: 1e9 }),
        (on, stated) => {
          const before = reconciliation(chart, ledger, {
            accountId: card,
            stated: money(stated, 'USD'),
            on,
          });
          fc.pre(before.difference.amountMinor !== 0);
          const adjusted = [
            ...ledger,
            unrecordedAdjustment(chart, meta(on), {
              accountId: card,
              difference: before.difference,
              ...categories,
            }),
          ];
          expect(balanceOf(chart, adjusted, card, on)).toEqual(
            money(stated, 'USD'),
          );
          const after = reconciliation(chart, adjusted, {
            accountId: card,
            stated: money(stated, 'USD'),
            on,
          });
          expect(after.difference.amountMinor).toBe(0);
        },
      ),
    );
  });
});
