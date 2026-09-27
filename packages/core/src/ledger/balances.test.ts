import { currencyCode, localDate, money } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import {
  accountBalances,
  balanceOf,
  budgetGroupBalances,
  budgetGroupOn,
} from './balances.ts';
import { budgetSwitch, expense, opening, transfer } from './build.ts';
import { reverse } from './reverse.ts';
import { errorCode, food, meta, testChart } from './testing.ts';
import { accountId, transactionId } from './types.ts';

const chart = testChart();
const card = accountId('card-USD');
const savings = accountId('savings-USD');
const wallet = accountId('card-EUR');
const usd = currencyCode('USD');

const ledger = [
  opening(chart, meta('2026-03-01'), {
    accountId: card,
    amount: money(180000, 'USD'),
  }),
  opening(chart, meta('2026-03-01'), {
    accountId: savings,
    amount: money(500000, 'USD'),
  }),
  expense(chart, meta('2026-03-03'), {
    accountId: card,
    amount: money(4500, 'USD'),
    categoryId: food,
  }),
  transfer(chart, meta('2026-03-04'), {
    fromId: card,
    toId: wallet,
    sent: money(10000, 'USD'),
    received: money(9150, 'EUR'),
  }),
];

describe('accountBalances', () => {
  it('sums postings on or before the date', () => {
    expect(balanceOf(chart, ledger, card, localDate('2026-02-28'))).toEqual(
      money(0, 'USD'),
    );
    expect(balanceOf(chart, ledger, card, localDate('2026-03-03'))).toEqual(
      money(175500, 'USD'),
    );
    expect(balanceOf(chart, ledger, card)).toEqual(money(165500, 'USD'));
    expect(balanceOf(chart, ledger, wallet)).toEqual(money(9150, 'EUR'));
  });

  it('nets every currency to zero across all accounts', () => {
    const totals = new Map<string, number>();
    for (const balance of accountBalances(ledger).values()) {
      totals.set(
        balance.currency,
        (totals.get(balance.currency) ?? 0) + balance.amountMinor,
      );
    }
    expect(Object.fromEntries(totals)).toEqual({ USD: 0, EUR: 0 });
  });

  it('refuses an unknown account', () => {
    expect(errorCode(() => balanceOf(chart, ledger, accountId('nope')))).toBe(
      'ledger.unknown_account',
    );
  });
});

describe('budgetGroupBalances', () => {
  it('totals each group per currency, savings never on budget', () => {
    const groups = budgetGroupBalances(chart, ledger);
    expect([...groups.on.values()]).toEqual([
      money(9150, 'EUR'),
      money(165500, 'USD'),
    ]);
    expect([...groups.off.values()]).toEqual([money(500000, 'USD')]);
  });

  it('counts a switched account in its new group from the switch date', () => {
    const move = budgetSwitch(chart, ledger, meta('2026-03-10'), {
      accountId: savings,
      budgetGroup: 'on',
    });
    const all = [...ledger, move];
    expect(
      budgetGroupBalances(chart, all, localDate('2026-03-09')).on.get(usd),
    ).toEqual(money(165500, 'USD'));
    expect(
      budgetGroupBalances(chart, all, localDate('2026-03-10')).on.get(usd),
    ).toEqual(money(665500, 'USD'));
    expect(budgetGroupBalances(chart, all).off.size).toBe(0);
  });

  it('applies same-day switches in creation order, whatever the input order', () => {
    const off = budgetSwitch(
      chart,
      [],
      meta('2026-03-10', { createdAt: '2026-03-10T09:00:00Z' }),
      { accountId: card, budgetGroup: 'off' },
    );
    const back = budgetSwitch(
      chart,
      [off],
      meta('2026-03-10', { createdAt: '2026-03-10T10:00:00Z' }),
      { accountId: card, budgetGroup: 'on' },
    );
    expect(budgetGroupOn(chart, [back, off], card)).toBe('on');
    expect(budgetGroupOn(chart, [off, back], card)).toBe('on');
    const undo = reverse(chart, [off, back], back.id, {
      id: transactionId('undo'),
      createdAt: '2026-03-11T00:00:00Z',
    });
    expect(budgetGroupOn(chart, [off, back, undo], card)).toBe('off');
  });
});
