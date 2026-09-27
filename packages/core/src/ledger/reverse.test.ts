import { localDate, money } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { accountBalances, balanceOf, budgetGroupOn } from './balances.ts';
import { budgetSwitch, expense, income, opening } from './build.ts';
import { edit, reverse } from './reverse.ts';
import { errorCode, food, meta, salary, testChart } from './testing.ts';
import { accountId, transactionId } from './types.ts';

const chart = testChart();
const card = accountId('card-USD');
const later = { id: transactionId('undo'), createdAt: '2026-03-20T08:00:00Z' };

describe('reverse', () => {
  const spend = expense(chart, meta('2026-03-10', { note: 'lunch' }), {
    accountId: card,
    amount: money(1250, 'USD'),
    categoryId: food,
  });

  it('negates every posting, keeps the date and references the original', () => {
    const undo = reverse(chart, [spend], spend.id, later);
    expect(undo).toMatchObject({
      id: 'undo',
      kind: 'reversal',
      reversesId: spend.id,
      occurredOn: '2026-03-10',
      createdAt: later.createdAt,
      categoryId: food,
    });
    expect(undo.postings).toEqual([
      { accountId: card, amount: money(1250, 'USD'), categoryId: null },
      {
        accountId: accountId('expenses-USD'),
        amount: money(-1250, 'USD'),
        categoryId: food,
      },
    ]);
    expect(balanceOf(chart, [spend, undo], card)).toEqual(money(0, 'USD'));
  });

  it('refuses a second undo, an undo of an undo and unknown entries', () => {
    const undo = reverse(chart, [spend], spend.id, later);
    expect(
      errorCode(() => reverse(chart, [spend, undo], spend.id, later)),
    ).toBe('ledger.already_reversed');
    expect(errorCode(() => reverse(chart, [spend, undo], undo.id, later))).toBe(
      'ledger.reversal_of_reversal',
    );
    expect(
      errorCode(() => reverse(chart, [spend], transactionId('nope'), later)),
    ).toBe('ledger.not_found');
  });

  it('cancels a budget switch', () => {
    const move = budgetSwitch(chart, [], meta('2026-03-12'), {
      accountId: card,
      budgetGroup: 'off',
    });
    const undo = reverse(chart, [move], move.id, later);
    expect(undo.postings).toEqual([]);
    expect(
      budgetGroupOn(chart, [move, undo], card, localDate('2026-03-31')),
    ).toBe('on');
  });
});

describe('edit', () => {
  it('reverses the original and adds the replacement', () => {
    const pay = income(chart, meta('2026-03-01'), {
      accountId: card,
      amount: money(400000, 'USD'),
      categoryId: salary,
    });
    const fixed = income(chart, meta('2026-03-01'), {
      accountId: card,
      amount: money(410000, 'USD'),
      categoryId: salary,
    });
    const [undo, replacement] = edit(chart, [pay], pay.id, later, fixed);
    expect(undo.reversesId).toBe(pay.id);
    expect(replacement).toBe(fixed);
    expect(balanceOf(chart, [pay, undo, replacement], card)).toEqual(
      money(410000, 'USD'),
    );
  });

  it('refuses an undo as the replacement', () => {
    const start = opening(chart, meta(), {
      accountId: card,
      amount: money(100, 'USD'),
    });
    const undo = reverse(chart, [start], start.id, later);
    expect(errorCode(() => edit(chart, [start], start.id, later, undo))).toBe(
      'ledger.reversal_of_reversal',
    );
  });

  it('corrects balances for every day since the original date', () => {
    const spend = expense(chart, meta('2026-03-05'), {
      accountId: card,
      amount: money(999, 'USD'),
      categoryId: food,
    });
    const undo = reverse(chart, [spend], spend.id, later);
    for (const day of ['2026-03-05', '2026-03-06', '2026-03-31']) {
      expect(accountBalances([spend, undo], localDate(day)).get(card)).toEqual(
        money(0, 'USD'),
      );
    }
  });
});
