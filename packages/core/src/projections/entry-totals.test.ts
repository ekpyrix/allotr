import { money } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { expense, transfer } from '../ledger/build.ts';
import { reverse } from '../ledger/reverse.ts';
import { food, meta } from '../ledger/testing.ts';
import { categoryId, transactionId } from '../ledger/types.ts';
import { entryGroupTotals, entryTotals } from './entry-totals.ts';
import { card, cash, chart, paycheck, spend, wallet } from './testing.ts';

// Made-up figures. USD has 2 minor digits, JPY 0, KWD 3.
const usd = (amountMinor: number) => money(amountMinor, 'USD');
const eur = (amountMinor: number) => money(amountMinor, 'EUR');
const rent = categoryId('rent');

describe('entryTotals', () => {
  it('counts spent, income and net', () => {
    const entries = [
      paycheck('2026-04-01', 300000),
      spend('2026-04-01', 2500),
      spend('2026-04-02', 1000),
    ];
    expect(entryTotals(chart, entries)).toEqual({
      count: 3,
      byCurrency: [{ spent: usd(3500), income: usd(300000), net: usd(296500) }],
    });
  });

  it('is empty for no entries', () => {
    expect(entryTotals(chart, [])).toEqual({ count: 0, byCurrency: [] });
  });

  it('keeps currencies apart and orders them by code', () => {
    const totals = entryTotals(chart, [
      spend('2026-04-01', 1000, food, card),
      spend('2026-04-01', 700, food, wallet),
    ]);
    expect(totals.byCurrency.map((t) => t.spent)).toEqual([
      eur(700),
      usd(1000),
    ]);
  });

  it('counts a transfer as an entry but not as spent or income', () => {
    const moved = transfer(chart, meta('2026-04-03'), {
      fromId: card,
      toId: cash,
      sent: usd(4000),
      received: usd(4000),
    });
    expect(entryTotals(chart, [moved])).toEqual({ count: 1, byCurrency: [] });
  });

  it('lets an undo cancel its entry', () => {
    const lunch = spend('2026-04-04', 1250);
    const undo = reverse(chart, [lunch], lunch.id, {
      id: transactionId('undo'),
      createdAt: '2026-04-05T09:00:00.000Z',
    });
    expect(entryTotals(chart, [lunch, undo])).toEqual({
      count: 2,
      byCurrency: [{ spent: usd(0), income: usd(0), net: usd(0) }],
    });
  });
});

describe('entryGroupTotals', () => {
  const split = expense(chart, meta('2026-04-02'), {
    accountId: card,
    amount: usd(9000),
    lines: [
      { categoryId: food, amount: usd(6000) },
      { categoryId: rent, amount: usd(3000) },
    ],
  });
  const entries = [
    paycheck('2026-04-01', 300000),
    spend('2026-04-01', 2500),
    split,
    transfer(chart, meta('2026-04-02'), {
      fromId: card,
      toId: cash,
      sent: usd(100),
      received: usd(100),
    }),
  ];

  it('groups by day, newest first', () => {
    const groups = entryGroupTotals(chart, entries, 'day');
    expect(groups.map((g) => [g.key, g.count])).toEqual([
      ['2026-04-02', 2],
      ['2026-04-01', 2],
    ]);
    expect(groups[0]?.byCurrency).toEqual([
      { spent: usd(9000), income: usd(0), net: usd(-9000) },
    ]);
  });

  it('puts each line of a split in its own category', () => {
    const groups = entryGroupTotals(chart, entries, 'category');
    const byKey = new Map(groups.map((g) => [g.key, g]));
    expect(byKey.get('food')?.byCurrency[0]?.spent).toEqual(usd(8500));
    expect(byKey.get('rent')?.byCurrency[0]?.spent).toEqual(usd(3000));
    expect(byKey.get('food')?.count).toBe(2);
    // The transfer has no category: it is in the group with none, last.
    expect(groups.at(-1)).toEqual({ key: null, count: 1, byCurrency: [] });
  });
});
