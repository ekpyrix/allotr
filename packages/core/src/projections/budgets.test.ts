import { money } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { reverse } from '../ledger/reverse.ts';
import { food } from '../ledger/testing.ts';
import { categoryId, type Transaction } from '../ledger/types.ts';
import { billId } from './types.ts';
import { budgetStatus } from './budget-status.ts';
import {
  budgetId,
  tagId,
  type Budget,
  type BudgetSetup,
  type BudgetTarget,
} from './budgets.ts';
import { budgetFold, dailyFiguresOn } from './daily.ts';
import {
  day,
  openingUsd,
  paycheck,
  savings,
  settings,
  spend,
  view,
} from './testing.ts';
import type { LedgerView } from './types.ts';

// Budgets with made-up amounts: Food $900, Travel $300, Everyday, Card. The
// user joined on 18 February; the paycheck on 1 March opens a cycle that runs
// to 1 April, so on 10 March 22 days are left.

const groceries = categoryId('groceries');
const travel = categoryId('travel');
const other = categoryId('other');

const usd = (amountMinor: number) => money(amountMinor, 'USD');

function budget(
  id: string,
  target: BudgetTarget,
  amountMinor: number,
  overrides: Partial<Budget> = {},
): Budget {
  return {
    id: budgetId(id),
    name: id,
    target,
    mode: 'daily',
    leftover: 'free',
    startedOn: day('2026-03-01'),
    endedOn: null,
    amounts: [{ from: day('2026-03-01'), amount: usd(amountMinor) }],
    ...overrides,
  };
}

const foodBudget = budget(
  'food',
  { kind: 'category', categoryId: food },
  90_000,
);
const travelBudget = budget(
  'travel',
  { kind: 'category', categoryId: travel },
  30_000,
  { mode: 'set-aside', leftover: 'carry' },
);
const buffer = budget('buffer', { kind: 'buffer' }, 0, {
  mode: 'set-aside',
  leftover: 'carry',
});

function setup(
  budgets: readonly Budget[],
  entryTags: BudgetSetup['entryTags'] = new Map(),
): BudgetSetup {
  return {
    budgets,
    categories: new Map([
      [food, { parent: null, mergedInto: null }],
      [groceries, { parent: food, mergedInto: null }],
      [travel, { parent: null, mergedInto: null }],
      [other, { parent: null, mergedInto: null }],
    ]),
    entryTags,
  };
}

const base: Transaction[] = [
  openingUsd('2026-02-18', 300_000),
  paycheck('2026-03-01', 200_000),
];

function withBudgets(
  ledger: readonly Transaction[],
  budgets: readonly Budget[],
  overrides: Partial<LedgerView> = {},
) {
  return view([...base, ...ledger], { budgets: setup(budgets), ...overrides });
}

const today = day('2026-03-10');

function line(v: LedgerView, id: string) {
  const found = budgetStatus(v, today).lines.find((l) => l.budget.id === id);
  if (found === undefined) throw new Error(`no budget ${id}`);
  return found;
}

describe('budget status', () => {
  const ledger = [
    spend('2026-03-03', 12_000, groceries),
    spend('2026-03-05', 10_000, travel),
    spend('2026-03-06', 5_000, other),
  ];
  const v = withBudgets(ledger, [foodBudget, travelBudget, buffer]);

  it('counts a child category toward its parent budget', () => {
    expect(line(v, 'food')).toMatchObject({
      planned: usd(90_000),
      spent: usd(12_000),
      left: usd(78_000),
      held: usd(0),
    });
  });

  it('holds what a set-aside budget has left out of free money', () => {
    expect(line(v, 'travel')).toMatchObject({
      planned: usd(30_000),
      spent: usd(10_000),
      left: usd(20_000),
      held: usd(20_000),
    });
    const status = budgetStatus(v, today);
    expect(status.available).toEqual(usd(473_000));
    expect(status.held).toEqual(usd(20_000));
    expect(status.free).toEqual(usd(453_000));
    expect(status.unbudgeted).toEqual(usd(5_000));
    expect(status.dailyLeft).toEqual(usd(78_000));
  });

  it('divides free money by the days left', () => {
    const status = budgetStatus(v, today);
    expect(status.daysLeft).toBe(22);
    expect(status.dailyNumber).toEqual(usd(20_590));
  });

  it('ignores a daily budget for the daily number by default', () => {
    const without = withBudgets(ledger, [travelBudget, buffer]);
    expect(dailyFiguresOn(v, today).liveDaily).toEqual(
      dailyFiguresOn(without, today).liveDaily,
    );
  });

  it('is the plain daily number when there are no budgets', () => {
    const plain = view([...base, ...ledger]);
    const empty = withBudgets(ledger, []);
    const zeroBuffer = withBudgets(ledger, [buffer]);
    expect(dailyFiguresOn(empty, today)).toEqual(dailyFiguresOn(plain, today));
    expect(dailyFiguresOn(zeroBuffer, today)).toEqual(
      dailyFiguresOn(plain, today),
    );
  });
});

describe('which budget an entry counts toward', () => {
  it('prefers a tag budget over a category budget', () => {
    const trip = tagId('trip');
    const dinner = spend('2026-03-04', 4_000, food);
    const budgets = [
      budget('trip', { kind: 'tag', tagId: trip }, 50_000),
      foodBudget,
    ];
    const v = view([...base, dinner], {
      budgets: setup(budgets, new Map([[dinner.id, [trip]]])),
    });
    expect(line(v, 'trip').spent).toEqual(usd(4_000));
    expect(line(v, 'food').spent).toEqual(usd(0));
  });

  it('prefers a child category budget over its parent', () => {
    const child = budget(
      'groceries',
      { kind: 'category', categoryId: groceries },
      40_000,
    );
    const v = withBudgets(
      [spend('2026-03-03', 7_000, groceries), spend('2026-03-04', 3_000, food)],
      [foodBudget, child],
    );
    expect(line(v, 'groceries').spent).toEqual(usd(7_000));
    expect(line(v, 'food').spent).toEqual(usd(3_000));
  });

  it('follows a merged category to the one it was merged into', () => {
    const merged = categoryId('old-travel');
    const v = view([...base, spend('2026-03-03', 2_500, merged)], {
      budgets: {
        ...setup([travelBudget]),
        categories: new Map([
          [travel, { parent: null, mergedInto: null }],
          [merged, { parent: null, mergedInto: travel }],
        ]),
      },
    });
    expect(line(v, 'travel').spent).toEqual(usd(2_500));
  });

  it('counts an undone entry as if it never happened', () => {
    const dinner = spend('2026-03-04', 4_000, food);
    const undo = reverse(view([]).chart, [dinner], dinner.id, {
      id: dinner.id.replace('t', 'u') as typeof dinner.id,
      createdAt: '2026-03-04T12:00:00.000Z',
    });
    const v = withBudgets([dinner, undo], [foodBudget]);
    expect(line(v, 'food').spent).toEqual(usd(0));
  });

  it('leaves spending from a savings account out', () => {
    const v = withBudgets(
      [
        openingUsd('2026-03-02', 50_000, savings),
        spend('2026-03-04', 4_000, food, savings),
      ],
      [foodBudget],
    );
    expect(line(v, 'food').spent).toEqual(usd(0));
  });

  it('counts every line of a split toward the budget of its own category', () => {
    const v = withBudgets(
      [spend('2026-03-03', 6_000, food), spend('2026-03-03', 2_000, travel)],
      [foodBudget, travelBudget],
    );
    expect(line(v, 'food').spent).toEqual(usd(6_000));
    expect(line(v, 'travel').spent).toEqual(usd(2_000));
  });
});

describe('bill payments', () => {
  it('leave out a payment linked to a bill that was already reserved', () => {
    const rent = spend('2026-03-05', 50_000, travel);
    const ordinary = spend('2026-03-06', 4_000, travel);
    const v = view([...base, rent, ordinary], {
      budgets: setup([travelBudget]),
      bills: [
        {
          id: billId('rent'),
          amount: usd(50_000),
          dueDay: 5,
          payments: [
            {
              dueOn: day('2026-03-05'),
              paidOn: day('2026-03-05'),
              transactionId: rent.id,
              paid: usd(50_000),
            },
          ],
        },
      ],
    });
    const status = budgetStatus(v, today);
    expect(status.lines[0]?.spent).toEqual(usd(4_000));
    expect(status.lines[0]?.held).toEqual(usd(26_000));
  });
});

describe('periods', () => {
  it('returns the leftover to free money at payday, or carries it', () => {
    const march = [spend('2026-03-03', 20_000, travel)];
    const april = [paycheck('2026-04-01', 200_000)];
    const free = budget(
      'travel',
      { kind: 'category', categoryId: travel },
      30_000,
      {
        mode: 'set-aside',
        leftover: 'free',
      },
    );
    const next = day('2026-04-02');
    const status = (b: Budget) =>
      budgetStatus(withBudgets([...march, ...april], [b]), next).lines[0];
    expect(status(free)).toMatchObject({
      carriedIn: usd(0),
      left: usd(30_000),
    });
    expect(status(travelBudget)).toMatchObject({
      carriedIn: usd(10_000),
      left: usd(40_000),
      held: usd(40_000),
    });
  });

  it('never carries a negative leftover', () => {
    const v = withBudgets(
      [spend('2026-03-03', 45_000, travel), paycheck('2026-04-01', 200_000)],
      [travelBudget],
    );
    expect(budgetStatus(v, day('2026-04-02')).lines[0]).toMatchObject({
      carriedIn: usd(0),
      left: usd(30_000),
    });
  });

  it('follows calendar months when the setting says so', () => {
    const v = view(
      [
        ...base,
        spend('2026-03-03', 9_000, food),
        spend('2026-03-20', 1_000, food),
      ],
      {
        budgets: setup([foodBudget]),
        settings: settings({ budgetPeriod: 'month' }),
      },
    );
    const status = budgetStatus(v, day('2026-03-25'));
    expect(status.period).toEqual({ from: '2026-03-01', to: '2026-04-01' });
    expect(status.lines[0]?.spent).toEqual(usd(10_000));
    const april = budgetStatus(v, day('2026-04-02'));
    expect(april.period).toEqual({ from: '2026-04-01', to: '2026-05-01' });
    expect(april.lines[0]?.spent).toEqual(usd(0));
  });

  it('uses the amount in force for each period', () => {
    const raised = budget(
      'food',
      { kind: 'category', categoryId: food },
      90_000,
      {
        amounts: [
          { from: day('2026-03-01'), amount: usd(90_000) },
          { from: day('2026-04-01'), amount: usd(100_000) },
        ],
      },
    );
    const v = withBudgets([paycheck('2026-04-01', 200_000)], [raised]);
    expect(budgetStatus(v, day('2026-03-15')).lines[0]?.planned).toEqual(
      usd(90_000),
    );
    expect(budgetStatus(v, day('2026-04-02')).lines[0]?.planned).toEqual(
      usd(100_000),
    );
  });

  it('applies an amount changed during a period to all of it, not to earlier ones', () => {
    const raised = budget(
      'food',
      { kind: 'category', categoryId: food },
      90_000,
      {
        amounts: [
          { from: day('2026-03-01'), amount: usd(90_000) },
          { from: day('2026-04-10'), amount: usd(100_000) },
        ],
      },
    );
    const v = withBudgets([paycheck('2026-04-01', 200_000)], [raised]);
    expect(budgetStatus(v, day('2026-03-20')).lines[0]?.planned).toEqual(
      usd(90_000),
    );
    expect(budgetStatus(v, day('2026-04-15')).lines[0]?.planned).toEqual(
      usd(100_000),
    );
  });

  it('starts counting from the period that holds the start day', () => {
    const late = budget(
      'food',
      { kind: 'category', categoryId: food },
      90_000,
      {
        startedOn: day('2026-04-05'),
        amounts: [{ from: day('2026-04-01'), amount: usd(90_000) }],
      },
    );
    const v = withBudgets([paycheck('2026-04-01', 200_000)], [late]);
    expect(budgetStatus(v, day('2026-03-20')).lines).toEqual([]);
    expect(budgetStatus(v, day('2026-04-10')).lines).toHaveLength(1);
  });

  it('drops an ended budget from the period after it ends', () => {
    const ended = { ...foodBudget, endedOn: day('2026-03-31') };
    const v = withBudgets([paycheck('2026-04-01', 200_000)], [ended]);
    expect(budgetStatus(v, day('2026-03-20')).lines).toHaveLength(1);
    expect(budgetStatus(v, day('2026-04-02')).lines).toHaveLength(0);
  });
});

describe('the daily number by mode', () => {
  const ledger = [
    spend('2026-03-03', 12_000, groceries),
    spend('2026-03-10', 10_000, travel),
    spend('2026-03-10', 2_500, other),
  ];
  const budgets = [foodBudget, travelBudget];
  const figures = (mode: 'free' | 'pool-minus-bills' | 'daily-budgets') =>
    dailyFiguresOn(
      withBudgets(ledger, budgets, { settings: settings({ dailyMode: mode }) }),
      today,
    );

  it('free money leaves out what the set-aside budget holds, and spending from it', () => {
    const f = figures('free');
    // 5,000.00 less 245.00 spent; 200.00 of Travel is still held.
    expect(f.available).toEqual(usd(475_500));
    expect(f.held).toEqual(usd(20_000));
    expect(f.free).toEqual(usd(455_500));
    // Of today's 125.00, the 100.00 for Travel came out of its hold, so
    // only the 25.00 counts against the daily number.
    expect(f.dailySpentToday).toEqual(usd(2_500));
    expect(f.startOfDay).toEqual(usd(458_000));
    expect(f.liveDaily).toEqual(usd(20_704));
    expect(f.leftToday).toEqual(usd(20_818 - 2_500));
  });

  it('pools minus bills ignores budgets', () => {
    const f = figures('pool-minus-bills');
    expect(f.liveDaily).toEqual(usd(21_613));
    expect(f.dailySpentToday).toEqual(usd(12_500));
  });

  it('daily budgets divides what the daily budgets have left', () => {
    const f = figures('daily-budgets');
    expect(f.liveDaily).toEqual(usd(Math.floor(78_000 / 22)));
    // Neither the Travel hold nor the unbudgeted 25.00 touches it.
    expect(f.dailySpentToday).toEqual(usd(0));
  });
});

describe('golden: a month of budgets', () => {
  it('folds the same on every run, whatever order the ledger arrives in', () => {
    const entries = [
      spend('2026-03-02', 8_000, groceries),
      spend('2026-03-02', 3_000, travel),
      spend('2026-03-09', 6_500, food),
      spend('2026-03-09', 1_000, other),
    ];
    const forward = budgetFold(
      withBudgets(entries, [foodBudget, travelBudget, buffer]),
      today,
    );
    const backward = budgetFold(
      withBudgets([...entries].reverse(), [foodBudget, travelBudget, buffer]),
      today,
    );
    expect(forward?.lines.map((l) => [l.budget.id, l.spent])).toEqual(
      backward?.lines.map((l) => [l.budget.id, l.spent]),
    );
    expect(forward?.lines.map((l) => [l.budget.id, l.spent])).toEqual([
      ['food', 14_500n],
      ['travel', 3_000n],
      ['buffer', 0n],
    ]);
    expect(forward?.unbudgeted).toBe(1_000n);
  });
});
