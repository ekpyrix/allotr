import { money } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { income } from '../ledger/build.ts';
import { reverse } from '../ledger/reverse.ts';
import { food, meta } from '../ledger/testing.ts';
import { accountId, transactionId } from '../ledger/types.ts';
import { cycleOn, cyclesOf } from './cycles.ts';
import { dailyFiguresOn } from './daily.ts';
import { balanceHistory, cycleDays } from './series.ts';
import {
  card,
  chart,
  day,
  openingUsd,
  paycheck,
  savings,
  spend,
  view,
  viewFrom,
} from './testing.ts';
import { billId, type LedgerView } from './types.ts';

const usd = (amountMinor: number) => money(amountMinor, 'USD');

function openCycleDays(v: LedgerView, today: string) {
  const cycle = cycleOn(cyclesOf(v, day(today)), day(today));
  return cycleDays(v, cycle, day(today));
}

describe('cycleDays', () => {
  // April has 30 days: the cycle runs from 1 April to 30 April.
  const ledger = [
    paycheck('2026-04-01', 300000),
    spend('2026-04-01', 1000),
    spend('2026-04-03', 2500),
    spend('2026-04-03', 500),
  ];
  const v = viewFrom('2026-04-01', ledger);

  it('gives one row per day to the day before payday', () => {
    const { days } = openCycleDays(v, '2026-04-10');
    expect(days).toHaveLength(30);
    expect(days[0]?.date).toBe('2026-04-01');
    expect(days.at(-1)?.date).toBe('2026-04-30');
  });

  it('fills past days and leaves later days null', () => {
    const { days } = openCycleDays(v, '2026-04-10');
    expect(days[2]).toMatchObject({
      date: '2026-04-03',
      spent: usd(3000),
      cumulativeSpent: usd(4000),
      availableEnd: usd(296000),
    });
    expect(days[9]?.spent).toEqual(usd(0));
    expect(days[10]).toMatchObject({
      date: '2026-04-11',
      spent: null,
      cumulativeSpent: null,
      availableEnd: null,
      allowance: null,
    });
  });

  it("gives each day's allowance as of its start", () => {
    const { days } = openCycleDays(v, '2026-04-10');
    // $3,000 over 30 days on the 1st; $2,990 over 28 days on the 3rd.
    expect(days[0]?.allowance).toEqual(usd(10000));
    expect(days[2]?.allowance).toEqual(usd(10678));
  });

  it("matches today's figures on today's row", () => {
    const figures = dailyFiguresOn(v, day('2026-04-10'));
    const row = openCycleDays(v, '2026-04-10').days[9];
    expect(row?.allowance).toEqual(figures.todayAllowance);
    expect(row?.availableEnd).toEqual(figures.available);
    expect(row?.cumulativeSpent).toEqual(figures.paceSpent);
  });

  it('spreads the budget evenly, rounding down, ending at the budget', () => {
    const { days, budget } = openCycleDays(v, '2026-04-10');
    // Pace spent $40 plus $2,960 available.
    expect(budget).toEqual(usd(300000));
    expect(days[0]?.pace).toEqual(usd(10000));
    expect(days.at(-1)?.pace).toEqual(budget);
  });

  it('leaves a bill payment out of pace but not out of available', () => {
    const rentPaid = spend('2026-04-05', 80000);
    const withBill = view([...ledger, rentPaid], {
      settings: v.settings,
      bills: [
        {
          id: billId('rent'),
          amount: usd(80000),
          dueDay: 5,
          payments: [
            {
              dueOn: day('2026-04-05'),
              paidOn: day('2026-04-05'),
              transactionId: rentPaid.id,
            },
          ],
        },
      ],
    });
    const row = openCycleDays(withBill, '2026-04-05').days[4];
    expect(row?.spent).toEqual(usd(0));
    expect(row?.cumulativeSpent).toEqual(usd(4000));
    expect(row?.availableEnd).toEqual(usd(216000));
  });

  it('counts other income in available, never as spending', () => {
    const refund = income(chart, meta('2026-04-04'), {
      accountId: card,
      amount: usd(5000),
      categoryId: food,
    });
    const row = openCycleDays(
      view([...ledger, refund], { settings: v.settings }),
      '2026-04-04',
    ).days[3];
    expect(row?.spent).toEqual(usd(0));
    expect(row?.availableEnd).toEqual(usd(301000));
  });

  it('drops an undone entry from its own day on', () => {
    const [, , lunch] = ledger;
    if (lunch === undefined) throw new Error('fixture');
    const undo = reverse(chart, ledger, lunch.id, {
      id: transactionId('undo'),
      createdAt: '2026-04-06T09:00:00.000Z',
    });
    const { days } = openCycleDays(
      view([...ledger, undo], { settings: v.settings }),
      '2026-04-06',
    );
    // The undo keeps the original date, so the 3rd loses the $25.
    expect(days[2]?.spent).toEqual(usd(500));
    expect(days[5]?.cumulativeSpent).toEqual(usd(1500));
  });

  it('runs day by day through today while payday is overdue', () => {
    const { days } = openCycleDays(v, '2026-05-03');
    expect(days.at(-1)?.date).toBe('2026-05-03');
    expect(days.at(-1)?.allowance).not.toBeNull();
    expect(days).toHaveLength(33);
  });

  it('ends a closed cycle the day before it closed', () => {
    const next = view([...ledger, paycheck('2026-04-28', 300000)], {
      settings: v.settings,
    });
    const [first] = cyclesOf(next, day('2026-05-02'));
    if (first === undefined) throw new Error('fixture');
    const { days, budget } = cycleDays(next, first, day('2026-05-02'));
    expect(days).toHaveLength(27);
    expect(days.at(-1)?.date).toBe('2026-04-27');
    expect(days.every((row) => row.spent !== null)).toBe(true);
    expect(days.at(-1)?.pace).toEqual(budget);
  });
});

describe('balanceHistory', () => {
  const ledger = [
    openingUsd('2026-03-01', 10000),
    spend('2026-03-03', 2500),
    spend('2026-03-05', 1000),
    openingUsd('2026-03-02', 50000, savings),
    spend('2026-03-09', 700),
  ];

  it("gives the end-of-day balance in the account's currency", () => {
    expect(
      balanceHistory(view(ledger), card, day('2026-03-02'), day('2026-03-06')),
    ).toEqual([
      { date: '2026-03-02', balance: usd(10000) },
      { date: '2026-03-03', balance: usd(7500) },
      { date: '2026-03-04', balance: usd(7500) },
      { date: '2026-03-05', balance: usd(6500) },
      { date: '2026-03-06', balance: usd(6500) },
    ]);
  });

  it('starts at zero before the account had entries', () => {
    const [first] = balanceHistory(
      view(ledger),
      card,
      day('2026-02-27'),
      day('2026-02-28'),
    );
    expect(first?.balance).toEqual(usd(0));
  });

  it('throws for an account not in the chart', () => {
    expect(() =>
      balanceHistory(
        view(ledger),
        accountId('nope'),
        day('2026-03-01'),
        day('2026-03-02'),
      ),
    ).toThrow();
  });
});
