import { localDate, money } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { expense, opening } from './build.ts';
import {
  adjustmentKind,
  reconciliation,
  unrecordedAdjustment,
} from './reconcile.ts';
import { errorCode, food, meta, testChart } from './testing.ts';
import { accountId, categoryId, type Transaction } from './types.ts';

const chart = testChart();
const card = accountId('card-USD');
const unrecorded = categoryId('unrecorded');

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
  it('posts a shortfall as an expense on the reconcile date', () => {
    const t = unrecordedAdjustment(chart, meta('2026-03-10'), {
      accountId: card,
      difference: money(-750, 'USD'),
      categoryId: unrecorded,
    });
    expect(t.kind).toBe('expense');
    expect(t.categoryId).toBe(unrecorded);
    expect(t.occurredOn).toBe('2026-03-10');
  });

  it('posts a surplus as an income', () => {
    expect(adjustmentKind(money(200, 'USD'))).toBe('income');
    const t = unrecordedAdjustment(chart, meta(), {
      accountId: card,
      difference: money(200, 'USD'),
      categoryId: unrecorded,
    });
    expect(t.kind).toBe('income');
  });

  it('has nothing to post for a zero difference', () => {
    expect(errorCode(() => adjustmentKind(money(0, 'USD')))).toBe(
      'ledger.invalid_amount',
    );
  });
});
