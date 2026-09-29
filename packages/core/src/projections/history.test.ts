import { money, parseRate } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { expense, income, opening } from '../ledger/build.ts';
import { reverse } from '../ledger/reverse.ts';
import { food, meta, salary } from '../ledger/testing.ts';
import { categoryId, type Transaction } from '../ledger/types.ts';
import { cycleReports } from './history.ts';
import { card, chart, day, savings, view, wallet } from './testing.ts';

const usd = (amountMinor: number) => money(amountMinor, 'USD');
const eur = (amountMinor: number) => money(amountMinor, 'EUR');
const fun = categoryId('fun');
const snacks = categoryId('snacks');

// Every entry is recorded at noon UTC on `recorded`, the day it happened
// unless given.
function at(recorded: string) {
  return `${recorded}T12:00:00.000Z`;
}

function spent(
  on: string,
  amountMinor: number,
  recorded = on,
  category = food,
) {
  return expense(chart, meta(on, { createdAt: at(recorded) }), {
    accountId: card,
    amount: usd(amountMinor),
    categoryId: category,
  });
}

function paid(on: string, amountMinor: number, recorded = on) {
  return income(chart, meta(on, { createdAt: at(recorded) }), {
    accountId: card,
    amount: usd(amountMinor),
    categoryId: salary,
  });
}

const march = paid('2026-03-01', 300000);
const ledger: Transaction[] = [
  opening(chart, meta('2026-02-20', { createdAt: at('2026-02-20') }), {
    accountId: card,
    amount: usd(50000),
  }),
  opening(chart, meta('2026-02-20', { createdAt: at('2026-02-20') }), {
    accountId: savings,
    amount: usd(400000),
  }),
  march,
  spent('2026-03-03', 4000),
  spent('2026-03-20', 6000, '2026-03-20', fun),
  // Logged on payday for the day before, while the paycheck was not in yet.
  spent('2026-03-31', 1500, '2026-04-01'),
  paid('2026-04-01', 300000, '2026-04-02'),
];
const today = day('2026-04-05');

function reports(entries: readonly Transaction[] = ledger) {
  const [first, closed, open] = cycleReports(view(entries), today);
  if (first === undefined || closed === undefined || open === undefined) {
    throw new Error('expected three cycles');
  }
  return { first, closed, open };
}

describe('cycleReports', () => {
  it('reports each cycle in the default currency, oldest first', () => {
    const { first, closed, open } = reports();
    expect(first.cycle).toMatchObject({
      openedOn: '2026-02-18',
      closedOn: '2026-03-01',
    });
    expect(closed).toMatchObject({
      cycle: { openedOn: '2026-03-01', closedOn: '2026-04-01' },
      lastDay: '2026-03-31',
      opening: { on: usd(50000), off: usd(400000) },
      closing: { on: usd(338500), off: usd(400000) },
      income: usd(300000),
      spending: usd(11500),
      incomeByCategory: [{ categoryId: salary, amount: usd(300000) }],
      spendingByCategory: [
        { categoryId: fun, amount: usd(6000) },
        { categoryId: food, amount: usd(5500) },
      ],
      leftover: usd(338500),
      savingsNetChange: usd(0),
      amendments: [],
      missingRates: [],
    });
    expect(open).toMatchObject({
      cycle: { openedOn: '2026-04-01', closedOn: null },
      lastDay: '2026-04-05',
      amendments: [],
    });
  });

  it('does not count entries recorded before the closing paycheck', () => {
    expect(reports().closed.amendments).toEqual([]);
  });

  it('marks a cycle amended by an entry recorded after it closed', () => {
    const late = spent('2026-03-10', 2500, '2026-04-03');
    const { closed, open } = reports([...ledger, late]);
    expect(closed.amendments).toEqual([
      {
        transactionId: late.id,
        occurredOn: '2026-03-10',
        recordedAt: at('2026-04-03'),
      },
    ]);
    expect(closed.spending).toEqual(usd(14000));
    expect(closed.leftover).toEqual(usd(336000));
    expect(open.amendments).toEqual([]);
  });

  it('marks a cycle amended when one of its entries is undone later', () => {
    const [, , , coffee] = ledger;
    if (coffee === undefined) throw new Error('no entry');
    const undo = reverse(chart, ledger, coffee.id, {
      id: meta().id,
      createdAt: at('2026-04-04'),
    });
    const { closed } = reports([...ledger, undo]);
    expect(closed.amendments.map((a) => a.transactionId)).toEqual([undo.id]);
    expect(closed.spendingByCategory).toEqual([
      { categoryId: fun, amount: usd(6000) },
      { categoryId: food, amount: usd(1500) },
    ]);
  });

  it('never counts entries recorded at the same instant, as an import does', () => {
    const imported = ledger.map((t) => ({ ...t, createdAt: at('2026-04-05') }));
    const { first, closed } = reports(imported);
    expect(first.amendments).toEqual([]);
    expect(closed.amendments).toEqual([]);
  });

  it('leaves entries dated in the open cycle out of the closed one', () => {
    const { closed } = reports([
      ...ledger,
      spent('2026-04-02', 700, '2026-04-04'),
    ]);
    expect(closed.amendments).toEqual([]);
  });

  it('counts a merged category as the one it merged into', () => {
    const v = view([...ledger, spent('2026-03-05', 900, '2026-03-05', snacks)]);
    const [, closed] = cycleReports(v, today, new Map([[snacks, food]]));
    expect(closed?.spendingByCategory).toEqual([
      { categoryId: food, amount: usd(6400) },
      { categoryId: fun, amount: usd(6000) },
    ]);
  });

  it('converts at the rate of the last day and flags a missing one', () => {
    const euros = [
      opening(chart, meta('2026-02-20', { createdAt: at('2026-02-20') }), {
        accountId: wallet,
        amount: eur(20000),
      }),
      expense(chart, meta('2026-03-12', { createdAt: at('2026-03-12') }), {
        accountId: wallet,
        amount: eur(5000),
        categoryId: food,
      }),
    ];
    const rate = (asOf: string, value: string) => ({
      base: eur(0).currency,
      quote: usd(0).currency,
      rate: parseRate(value),
      asOf: day(asOf),
    });

    const withRates = cycleReports(
      view([...ledger, ...euros], {
        rates: [rate('2026-03-01', '1.10'), rate('2026-03-31', '1.20')],
      }),
      today,
    )[1];
    expect(withRates?.spending).toEqual(usd(11500 + 6000));
    expect(withRates?.spendingByCategory[0]).toEqual({
      categoryId: food,
      amount: usd(5500 + 6000),
    });
    expect(withRates?.missingRates).toEqual([]);

    const without = cycleReports(view([...ledger, ...euros]), today)[1];
    expect(without?.spending).toEqual(usd(11500));
    expect(without?.missingRates).toEqual(['EUR']);
  });

  it('counts an account opened during the cycle as opening money, not savings', () => {
    const { closed } = reports([
      ...ledger,
      opening(chart, meta('2026-03-10', { createdAt: at('2026-03-10') }), {
        accountId: savings,
        amount: usd(25000),
      }),
    ]);
    expect(closed.opening).toEqual({ on: usd(50000), off: usd(425000) });
    expect(closed.closing.off).toEqual(usd(425000));
    expect(closed.savingsNetChange).toEqual(usd(0));
  });

  it('stays amended when the closing paycheck is edited later', () => {
    const late = spent('2026-03-10', 2500, '2026-04-03');
    const april = ledger.at(-1);
    if (april === undefined) throw new Error('no paycheck');
    const undo = reverse(chart, ledger, april.id, {
      id: meta().id,
      createdAt: at('2026-04-05'),
    });
    const corrected = paid('2026-04-01', 310000, '2026-04-05');
    const { closed, open } = reports([...ledger, late, undo, corrected]);
    expect(open.cycle.openedBy).toBe(corrected.id);
    expect(closed.amendments.map((a) => a.transactionId)).toEqual([late.id]);
  });

  it('reports only the cycle asked for', () => {
    const only = cycleReports(
      view(ledger),
      today,
      new Map(),
      day('2026-03-01'),
    );
    expect(only.map((r) => r.cycle.openedOn)).toEqual(['2026-03-01']);
    expect(only[0]).toEqual(reports().closed);
    expect(
      cycleReports(view(ledger), today, new Map(), day('2026-03-02')),
    ).toEqual([]);
  });
});
