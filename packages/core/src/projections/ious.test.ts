import { money } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { borrow, lend, repayment, writeOffReceivable } from '../ledger/ious.ts';
import { reverse } from '../ledger/reverse.ts';
import { food, meta } from '../ledger/testing.ts';
import { transactionId, type Transaction } from '../ledger/types.ts';
import { budgetStatus } from './budget-status.ts';
import { budgetId, type Budget, type BudgetSetup } from './budgets.ts';
import { budgetFold, dailyFiguresOn } from './daily.ts';
import { cyclesOf } from './cycles.ts';
import {
  iouBalanceGaps,
  iouId,
  iouStatuses,
  iouTotals,
  type Iou,
  type IouSettlement,
} from './ious.ts';
import { netWorthOn, weeklyReview } from './plan.ts';
import { cycleSnapshot } from './snapshot.ts';
import {
  card,
  chart,
  day,
  openingUsd,
  paycheck,
  savings,
  view,
} from './testing.ts';
import type { LedgerView } from './types.ts';

// IOUs with made-up people and amounts: Sam Example and Alex Example split a
// $90 dinner three ways; Sam later borrows $50. The user has $1,500 in the
// counted accounts, Food $100 daily and a $200 Buffer, so free money is
// $1,300 before anything is lent.

const usd = (amountMinor: number) => money(amountMinor, 'USD');
const today = day('2026-03-10');

function fail(): never {
  throw new Error('expected a value');
}

const foodBudget: Budget = {
  id: budgetId('food'),
  name: 'Food',
  target: { kind: 'category', categoryId: food },
  mode: 'daily',
  leftover: 'free',
  startedOn: day('2026-03-01'),
  endedOn: null,
  amounts: [{ from: day('2026-03-01'), amount: usd(10_000) }],
};
const buffer: Budget = {
  id: budgetId('buffer'),
  name: 'Buffer',
  target: { kind: 'buffer' },
  mode: 'set-aside',
  leftover: 'carry',
  startedOn: day('2026-03-01'),
  endedOn: null,
  amounts: [{ from: day('2026-03-01'), amount: usd(20_000) }],
};
const budgets: BudgetSetup = {
  budgets: [foodBudget, buffer],
  categories: new Map([[food, { parent: null, mergedInto: null }]]),
  entryTags: new Map(),
};

const base: Transaction[] = [
  openingUsd('2026-02-18', 100_000),
  paycheck('2026-03-01', 50_000),
];

function iou(
  id: string,
  origin: Transaction,
  person: string,
  amountMinor: number,
  extra: Partial<Iou> = {},
): Iou {
  return {
    id: iouId(id),
    direction: 'owed-to-me',
    person,
    amount: usd(amountMinor),
    originId: origin.id,
    recordedOn: origin.occurredOn,
    dueOn: null,
    settlements: [],
    ...extra,
  };
}

function settle(
  id: string,
  by: Transaction,
  amountMinor: number,
  kind: IouSettlement['kind'] = 'repayment',
): IouSettlement {
  return {
    id,
    transactionId: by.id,
    kind,
    amount: usd(amountMinor),
    on: by.occurredOn,
    at: by.createdAt,
  };
}

function make(ledger: readonly Transaction[], ious: readonly Iou[] = []) {
  return view([...base, ...ledger], {
    budgets,
    ious: { ious, writeOffAfterDays: 90 },
  });
}

const dinner = lend(chart, meta('2026-03-05'), {
  accountId: card,
  owed: [usd(3_000), usd(3_000)],
  own: { amount: usd(3_000), categoryId: food },
});
const sam = (extra: Partial<Iou> = {}) =>
  iou('iou-sam', dinner, 'Sam Example', 3_000, extra);
const alex = (extra: Partial<Iou> = {}) =>
  iou('iou-alex', dinner, 'Alex Example', 3_000, extra);

describe('a split bill', () => {
  const v = make([dinner], [sam(), alex()]);
  const daily = dailyFiguresOn(v, today);

  it('counts only the user share as spending', () => {
    expect(daily.spentToday).toEqual(usd(0));
    expect(daily.cycleSpent).toEqual(usd(3_000));
    expect(daily.paceSpent).toEqual(usd(3_000));
  });

  it('takes the whole payment out of the counted money', () => {
    expect(daily.onBudget).toEqual(usd(150_000 - 9_000));
  });

  it('puts the share in its category and the rest in neither', () => {
    const snapshot = cycleSnapshot(v, cyclesOf(v, today)[1] ?? fail(), today);
    expect(snapshot.spending).toEqual([
      { categoryId: food, amount: usd(3_000) },
    ]);
  });

  it('counts the share toward its budget and covers the loans from free money', () => {
    const status = budgetStatus(v, today);
    expect(status.lines[0]).toMatchObject({
      spent: usd(3_000),
      left: usd(7_000),
    });
    expect(status.unbudgeted).toEqual(usd(0));
    // The $60 owed to the user was covered by free money.
    expect(status.covered.fromFree).toEqual(usd(6_000));
    expect(status.free).toEqual(usd(150_000 - 9_000 - 20_000));
  });

  it('is not part of the weekly review spending', () => {
    expect(weeklyReview(v, today).spent).toEqual(usd(3_000));
  });

  it('adds what people owe to net worth', () => {
    // Only the user's own $30 share is gone; the $60 owed is still worth $60.
    expect(netWorthOn(v, today).amount).toEqual(usd(150_000 - 3_000));
  });

  it('lists two outstanding IOUs', () => {
    const list = iouStatuses(v, today);
    expect(list.map((s) => [s.iou.person, s.outstanding.amountMinor])).toEqual([
      ['Alex Example', 3_000],
      ['Sam Example', 3_000],
    ]);
    expect(iouTotals(v, today).owedToMe).toEqual(usd(6_000));
    expect(iouBalanceGaps(v, today).size).toBe(0);
  });
});

describe('lending', () => {
  const loan = lend(chart, meta('2026-03-06'), {
    accountId: card,
    owed: [usd(50_000)],
  });
  const loanIou = iou('iou-loan', loan, 'Sam Example', 50_000);

  it('lowers free money and the day, but is not spending', () => {
    const v = make([loan], [loanIou]);
    const daily = dailyFiguresOn(v, today);
    expect(daily.available).toEqual(usd(100_000));
    expect(daily.spentToday).toEqual(usd(0));
    expect(daily.cycleSpent).toEqual(usd(0));
    expect(daily.paceSpent).toEqual(usd(0));
    expect(budgetStatus(v, today).unbudgeted).toEqual(usd(0));
  });

  it('taps the Buffer once free money is used up, and a repayment refills it first', () => {
    // Free money is $1,300; lend $1,400 so the Buffer covers $100.
    const big = lend(chart, meta('2026-03-06'), {
      accountId: card,
      owed: [usd(140_000)],
    });
    const owed = iou('iou-big', big, 'Sam Example', 140_000);
    const lent = make([big], [owed]);
    const [line] = budgetFold(lent, today)?.spend ?? [];
    expect(line).toMatchObject({ loan: true, uncovered: 0n });
    expect(line?.covers.map((c) => [c.source, Number(c.amount)])).toEqual([
      ['free', 130_000],
      [buffer.id, 10_000],
    ]);

    const back = repayment(chart, meta('2026-03-08'), {
      accountId: card,
      direction: 'owed-to-me',
      amount: usd(40_000),
    });
    const repaid = make(
      [big, back],
      [
        iou('iou-big', big, 'Sam Example', 140_000, {
          settlements: [settle('s1', back, 40_000)],
        }),
      ],
    );
    const status = budgetStatus(repaid, today);
    const bufferLine = status.lines.find((l) => l.budget.id === buffer.id);
    // $100 of the $400 came back to the Buffer; the rest is free money.
    expect(bufferLine?.restored).toEqual(usd(10_000));
    expect(bufferLine?.left).toEqual(usd(20_000));
  });

  it('never refills from a repayment larger than what the loan took', () => {
    const big = lend(chart, meta('2026-03-06'), {
      accountId: card,
      owed: [usd(140_000)],
    });
    const back = repayment(chart, meta('2026-03-08'), {
      accountId: card,
      direction: 'owed-to-me',
      amount: usd(140_000),
    });
    const v = make(
      [big, back],
      [
        iou('iou-big', big, 'Sam Example', 140_000, {
          settlements: [settle('s1', back, 140_000)],
        }),
      ],
    );
    const status = budgetStatus(v, today);
    expect(
      status.lines.find((l) => l.budget.id === buffer.id)?.restored,
    ).toEqual(usd(10_000));
    expect(status.free).toEqual(usd(130_000));
    expect(iouStatuses(v, today)[0]?.settled).toBe(true);
  });

  it('does not refill a loan from a refund of the expense share', () => {
    const v = make([dinner], [sam(), alex()]);
    const [expenseLine, loanLine] = budgetFold(v, today)?.spend ?? [];
    expect(expenseLine?.loan).toBe(false);
    expect(loanLine?.loan).toBe(true);
  });
});

describe('borrowing', () => {
  const loan = borrow(chart, meta('2026-03-06'), {
    accountId: card,
    owed: [usd(6_000)],
  });
  const owed = iou('iou-b', loan, 'Alex Example', 6_000, {
    direction: 'owed-by-me',
  });

  it('reserves what is owed, so the money borrowed is not free to spend', () => {
    const before = dailyFiguresOn(make([]), today);
    const v = make([loan], [owed]);
    const daily = dailyFiguresOn(v, today);
    expect(daily.onBudget).toEqual(usd(before.onBudget.amountMinor + 6_000));
    expect(daily.available).toEqual(before.available);
    expect(daily.reserved).toEqual(usd(6_000));
    expect(daily.spentToday).toEqual(usd(0));
    expect(netWorthOn(v, today).amount).toEqual(
      netWorthOn(make([]), today).amount,
    );
  });

  it('releases the reserve when it is paid, without spending', () => {
    const pay = repayment(chart, meta('2026-03-09'), {
      accountId: card,
      direction: 'owed-by-me',
      amount: usd(6_000),
    });
    const v = make(
      [loan, pay],
      [{ ...owed, settlements: [settle('s1', pay, 6_000)] }],
    );
    const daily = dailyFiguresOn(v, today);
    expect(daily.reserved).toEqual(usd(0));
    expect(daily.available).toEqual(dailyFiguresOn(make([]), today).available);
    expect(daily.cycleSpent).toEqual(usd(0));
    expect(iouBalanceGaps(v, today).size).toBe(0);
  });

  it('is reserved from the day it is recorded', () => {
    const v = make([loan], [owed]);
    expect(dailyFiguresOn(v, day('2026-03-05')).reserved).toEqual(usd(0));
    expect(dailyFiguresOn(v, day('2026-03-06')).reserved).toEqual(usd(6_000));
  });
});

describe('write-off', () => {
  const loan = lend(chart, meta('2026-03-02'), {
    accountId: card,
    owed: [usd(4_000)],
  });
  const written = writeOffReceivable(chart, meta('2026-06-20'), {
    amount: usd(1_500),
    categoryId: food,
  });

  it('is offered after the configured time past the due date', () => {
    const owed = iou('iou-w', loan, 'Sam Example', 4_000, {
      dueOn: day('2026-03-20'),
    });
    const v = make([loan], [owed]);
    expect(iouStatuses(v, day('2026-04-01'))[0]).toMatchObject({
      overdue: true,
      daysOverdue: 12,
      writeOffOffered: false,
      writeOffOfferedOn: '2026-06-18',
    });
    expect(iouStatuses(v, day('2026-06-18'))[0]?.writeOffOffered).toBe(true);
  });

  it('turns the remainder into an expense without moving cash', () => {
    const repay = repayment(chart, meta('2026-04-02'), {
      accountId: card,
      direction: 'owed-to-me',
      amount: usd(2_500),
    });
    const owed = iou('iou-w', loan, 'Sam Example', 4_000, {
      dueOn: day('2026-03-20'),
      settlements: [
        settle('s1', repay, 2_500),
        settle('s2', written, 1_500, 'write-off'),
      ],
    });
    const v = make([loan, repay, written], [owed]);
    const later = day('2026-06-25');
    const status = iouStatuses(v, later)[0];
    expect(status).toMatchObject({ settled: true });
    expect(status?.writtenOff).toEqual(usd(1_500));
    expect(iouBalanceGaps(v, later).size).toBe(0);
    // No cash moved on the day, so the day's spending is unchanged.
    expect(dailyFiguresOn(v, later).spentToday).toEqual(usd(0));
    // Net worth falls by what was given up.
    expect(netWorthOn(v, later).amount).toEqual(usd(150_000 - 1_500));
  });
});

describe('undoing', () => {
  it('drops an IOU whose entry was undone', () => {
    const undo = reverse(chart, [...base, dinner], dinner.id, {
      id: transactionId('undo-dinner'),
      createdAt: '2026-03-06T00:00:00.000Z',
    });
    const v = make([dinner, undo], [sam(), alex()]);
    expect(iouStatuses(v, today)).toEqual([]);
    expect(iouBalanceGaps(v, today).size).toBe(0);
    expect(dailyFiguresOn(v, today).cycleSpent).toEqual(usd(0));
  });

  it('counts a repayment that was undone as unpaid', () => {
    const loan = lend(chart, meta('2026-03-02'), {
      accountId: card,
      owed: [usd(4_000)],
    });
    const back = repayment(chart, meta('2026-03-04'), {
      accountId: card,
      direction: 'owed-to-me',
      amount: usd(4_000),
    });
    const undo = reverse(chart, [loan, back], back.id, {
      id: transactionId('undo-back'),
      createdAt: '2026-03-05T00:00:00.000Z',
    });
    const v = make(
      [loan, back, undo],
      [
        iou('i', loan, 'Sam Example', 4_000, {
          settlements: [settle('s', back, 4_000)],
        }),
      ],
    );
    expect(iouStatuses(v, today)[0]?.outstanding).toEqual(usd(4_000));
    expect(iouBalanceGaps(v, today).size).toBe(0);
  });
});

describe('savings', () => {
  it('lending from savings does not count against the daily number', () => {
    const v = make([
      openingUsd('2026-02-18', 100_000, savings),
      lend(chart, meta('2026-03-06'), {
        accountId: savings,
        owed: [usd(10_000)],
      }),
    ]) satisfies LedgerView;
    expect(dailyFiguresOn(v, today).onBudget).toEqual(usd(150_000));
  });

  it('keeps the cash side of a split bill from savings out of spending', () => {
    const split = lend(chart, meta('2026-03-06'), {
      accountId: savings,
      owed: [usd(3_000)],
      own: { amount: usd(3_000), categoryId: food },
    });
    const v = make([openingUsd('2026-02-18', 100_000, savings), split]);
    expect(dailyFiguresOn(v, today).cycleSpent).toEqual(usd(0));
  });
});
