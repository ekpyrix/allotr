import { money } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { reverse } from '../ledger/reverse.ts';
import { food } from '../ledger/testing.ts';
import { categoryId, type Transaction } from '../ledger/types.ts';
import { budgetCovers, budgetStatus, coverPreview } from './budget-status.ts';
import {
  budgetId,
  type Budget,
  type BudgetSetup,
  type BudgetTarget,
  type CoverSource,
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

// Cover with made-up amounts: Food $100 daily, Travel $300 set aside, a
// Buffer of $200. The user has $1,500 in the counted accounts, so before any
// spending free money is $1,500 less the $500 held for Travel and the Buffer.

const other = categoryId('other');
const travel = categoryId('travel');
const usd = (amountMinor: number) => money(amountMinor, 'USD');
const today = day('2026-03-10');

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
  10_000,
);
const travelBudget = budget(
  'travel',
  { kind: 'category', categoryId: travel },
  30_000,
  { mode: 'set-aside', leftover: 'carry' },
);
const bufferBudget = budget('buffer', { kind: 'buffer' }, 20_000, {
  mode: 'set-aside',
  leftover: 'carry',
});

const base: Transaction[] = [
  openingUsd('2026-02-18', 100_000),
  paycheck('2026-03-01', 50_000),
];

function setup(
  budgets: readonly Budget[],
  extra: Partial<BudgetSetup> = {},
): BudgetSetup {
  return {
    budgets,
    categories: new Map([
      [food, { parent: null, mergedInto: null }],
      [travel, { parent: null, mergedInto: null }],
      [other, { parent: null, mergedInto: null }],
    ]),
    entryTags: new Map(),
    ...extra,
  };
}

function make(
  ledger: readonly Transaction[],
  budgets: readonly Budget[],
  extra: Partial<BudgetSetup> = {},
  overrides: Partial<LedgerView> = {},
): LedgerView {
  return view([...base, ...ledger], {
    budgets: setup(budgets, extra),
    ...overrides,
  });
}

function lineOf(v: LedgerView, entry: Transaction) {
  const found = budgetFold(v, today)?.spend.find((l) => l.entryId === entry.id);
  if (found === undefined) throw new Error('entry not counted');
  return found;
}

const takes = (covers: readonly { source: string; amount: bigint }[]) =>
  covers.map((c) => [c.source, Number(c.amount)]);

describe('cover', () => {
  it('lets free money cover a shortfall while there is free money', () => {
    const groceries = spend('2026-03-06', 14_000, food);
    const v = make([groceries], [foodBudget, travelBudget, bufferBudget]);
    const line = lineOf(v, groceries);
    expect(Number(line.own)).toBe(10_000);
    expect(takes(line.covers)).toEqual([['free', 4_000]]);
    expect(line.uncovered).toBe(0n);
    expect(line.fromHold).toBe(0n);
    const status = budgetStatus(v, today);
    // Spent counts all 140.00; the budget has nothing left.
    expect(status.lines[0]).toMatchObject({
      spent: usd(14_000),
      left: usd(0),
    });
    // $1,360 left in the counted accounts, $500 held.
    expect(status.free).toEqual(usd(86_000));
  });

  it('taps the Buffer when free money is used up', () => {
    const rent = spend('2026-03-05', 95_000, other);
    const groceries = spend('2026-03-06', 14_000, food);
    const v = make([rent, groceries], [foodBudget, travelBudget, bufferBudget]);
    const line = lineOf(v, groceries);
    expect(Number(line.own)).toBe(10_000);
    expect(takes(line.covers)).toEqual([[bufferBudget.id, 4_000]]);
    expect(line.uncovered).toBe(0n);
    expect(Number(line.fromHold)).toBe(4_000);
    const status = budgetStatus(v, today);
    const buffer = status.lines.find((l) => l.budget.id === 'buffer');
    expect(buffer).toMatchObject({ left: usd(16_000), held: usd(16_000) });
    expect(status.held).toEqual(usd(46_000));
  });

  it('leaves what nothing covers as uncovered, and the daily number negative', () => {
    const rent = spend('2026-03-05', 145_000, other);
    const groceries = spend('2026-03-06', 14_000, food);
    const noBuffer = {
      ...bufferBudget,
      amounts: [{ from: day('2026-03-01'), amount: usd(0) }],
    };
    const v = make([rent, groceries], [foodBudget, noBuffer]);
    const line = lineOf(v, groceries);
    expect(takes(line.covers)).toEqual([]);
    expect(Number(line.uncovered)).toBe(4_000);
    const figures = dailyFiguresOn(v, today);
    // $1,500 less $1,590 spent: $90 over, over 22 days.
    expect(figures.free).toEqual(usd(-9_000));
    expect(figures.liveDaily.amountMinor).toBeLessThan(0);
  });

  it('keeps the daily number from going negative while the Buffer can cover', () => {
    const rent = spend('2026-03-05', 140_000, other);
    const v = make([rent], [bufferBudget]);
    const line = lineOf(v, rent);
    // Free money was $1,300: it covers that, the Buffer the other $100.
    expect(takes(line.covers)).toEqual([
      ['free', 130_000],
      [bufferBudget.id, 10_000],
    ]);
    expect(dailyFiguresOn(v, today).free).toEqual(usd(0));
  });

  it('follows the cover order the user set', () => {
    const groceries = spend('2026-03-06', 14_000, food);
    const order: CoverSource[] = [bufferBudget.id, 'free', travelBudget.id];
    const v = make([groceries], [foodBudget, travelBudget, bufferBudget], {
      coverOrder: order,
    });
    expect(takes(lineOf(v, groceries).covers)).toEqual([
      [bufferBudget.id, 4_000],
    ]);
    expect(budgetFold(v, today)?.order).toEqual([
      bufferBudget.id,
      'free',
      travelBudget.id,
      foodBudget.id,
    ]);
  });

  it('puts free money first and the Buffer next when the order leaves them out', () => {
    const v = make([], [foodBudget, travelBudget, bufferBudget], {
      coverOrder: [travelBudget.id],
    });
    expect(budgetFold(v, today)?.order).toEqual([
      'free',
      bufferBudget.id,
      travelBudget.id,
      foodBudget.id,
    ]);
  });

  it("does not count a set-aside budget's own hold as a cost to free money", () => {
    const rent = spend('2026-03-05', 95_000, other);
    const trip = spend('2026-03-06', 100_000, travel);
    const v = make([rent, trip], [travelBudget, bufferBudget]);
    const line = lineOf(v, trip);
    // Travel pays its own $300 from its hold. Free money was $50 ($550 less
    // the $500 held), so it gives $50, the Buffer its $200, and $450 of the
    // $700 shortfall is left uncovered.
    expect(Number(line.own)).toBe(30_000);
    expect(takes(line.covers)).toEqual([
      ['free', 5_000],
      [bufferBudget.id, 20_000],
    ]);
    expect(Number(line.uncovered)).toBe(45_000);
    // Money is gone: $550 - $1,000 is $450 short, with nothing held.
    expect(dailyFiguresOn(v, today).free).toEqual(usd(-45_000));
  });

  it('never takes cover from the budget that overspent', () => {
    const trip = spend('2026-03-06', 100_000, travel);
    const v = make([trip], [travelBudget, bufferBudget]);
    const line = lineOf(v, trip);
    expect(Number(line.own)).toBe(30_000);
    expect(line.covers.some((c) => c.source === travelBudget.id)).toBe(false);
  });

  it('gives back an undone entry, cover included', () => {
    const rent = spend('2026-03-05', 95_000, other);
    const groceries = spend('2026-03-06', 14_000, food);
    const undo = reverse(view([]).chart, [groceries], groceries.id, {
      id: groceries.id.replace('t', 'u') as typeof groceries.id,
      createdAt: '2026-03-06T20:00:00.000Z',
    });
    const v = make(
      [rent, groceries, undo],
      [foodBudget, travelBudget, bufferBudget],
    );
    const status = budgetStatus(v, today);
    expect(status.lines.find((l) => l.budget.id === 'buffer')?.left).toEqual(
      usd(20_000),
    );
    expect(status.lines.find((l) => l.budget.id === 'food')?.spent).toEqual(
      usd(0),
    );
  });
});

describe('cover override', () => {
  const groceries = spend('2026-03-06', 14_000, food);
  const budgets = [foodBudget, travelBudget, bufferBudget];

  it('splits the shortfall as the user chose, on the entry only', () => {
    const v = make([groceries], budgets, {
      coverOverrides: new Map([
        [groceries.id, [{ source: travelBudget.id, amount: usd(4_000) }]],
      ]),
    });
    const line = lineOf(v, groceries);
    expect(takes(line.covers)).toEqual([[travelBudget.id, 4_000]]);
    expect(line.overridden).toBe(true);
    expect(Number(line.fromHold)).toBe(4_000);
    // The entry itself is as recorded.
    expect(v.ledger).toContain(groceries);
  });

  it('caps a request at what the source has, and covers the rest in order', () => {
    const trip = spend('2026-03-06', 100_000, food);
    const v = make([trip], budgets, {
      coverOverrides: new Map([
        [trip.id, [{ source: travelBudget.id, amount: usd(500_000) }]],
      ]),
    });
    const line = lineOf(v, trip);
    // Own $100; of the $900 shortfall Travel gives its $300, then the usual
    // order: free money has $1,500 - $500 held less the $100 own part.
    expect(takes(line.covers)).toEqual([
      [travelBudget.id, 30_000],
      ['free', 60_000],
    ]);
    expect(line.uncovered).toBe(0n);
  });

  it('cannot cover from a source that is gone', () => {
    const v = make([groceries], budgets, {
      coverOverrides: new Map([
        [groceries.id, [{ source: budgetId('gone'), amount: usd(4_000) }]],
      ]),
    });
    expect(takes(lineOf(v, groceries).covers)).toEqual([['free', 4_000]]);
  });
});

describe('refill', () => {
  const rent = spend('2026-03-05', 95_000, other);
  // Free money is $50 when this lands: $100 own, $50 from free money would
  // leave nothing, so the shortfall goes to the Buffer and Travel.
  const big = spend('2026-03-06', 70_000, food);
  const budgets = [foodBudget, travelBudget, bufferBudget];
  const returnsOf = (amountMinor: number, on = '2026-03-08') => ({
    returns: [
      {
        id: 'r1',
        against: big.id,
        amount: usd(amountMinor),
        on: day(on),
        at: `${on}T10:00:00.000Z`,
      },
    ],
  });

  it('has the cover to restore', () => {
    const v = make([rent, big], budgets);
    // Own $100 (landing on free money), then Buffer $200 and Travel $300.
    expect(takes(lineOf(v, big).covers)).toEqual([
      [bufferBudget.id, 20_000],
      [travelBudget.id, 30_000],
    ]);
    expect(Number(lineOf(v, big).uncovered)).toBe(10_000);
  });

  it('restores what the cover took in reverse order, then goes to free money', () => {
    const v = make([rent, big], budgets, returnsOf(35_000));
    const fold = budgetFold(v, today);
    expect(fold?.refills).toEqual([
      {
        returnId: 'r1',
        restored: [
          { source: travelBudget.id, amount: 30_000n },
          { source: bufferBudget.id, amount: 5_000n },
        ],
        toFree: 0n,
      },
    ]);
    const status = budgetStatus(v, today);
    expect(status.lines.find((l) => l.budget.id === 'travel')?.left).toEqual(
      usd(30_000),
    );
    expect(status.lines.find((l) => l.budget.id === 'buffer')?.left).toEqual(
      usd(5_000),
    );
  });

  it('never restores more than was taken', () => {
    const v = make([rent, big], budgets, returnsOf(80_000));
    const fold = budgetFold(v, today);
    expect(fold?.refills[0]).toEqual({
      returnId: 'r1',
      restored: [
        { source: travelBudget.id, amount: 30_000n },
        { source: bufferBudget.id, amount: 20_000n },
      ],
      toFree: 30_000n,
    });
  });

  it('sends it all to free money when nothing was covered from a budget', () => {
    const small = spend('2026-03-06', 12_000, food);
    const v = make([small], budgets, {
      returns: [
        {
          id: 'r2',
          against: small.id,
          amount: usd(2_000),
          on: day('2026-03-08'),
          at: '2026-03-08T10:00:00.000Z',
        },
      ],
    });
    expect(budgetFold(v, today)?.refills).toEqual([
      { returnId: 'r2', restored: [], toFree: 2_000n },
    ]);
  });
});

describe("a refund and the budget's spent", () => {
  const budgets = [foodBudget, travelBudget, bufferBudget];
  const refundOf = (entry: Transaction, amountMinor: number) => ({
    returns: [
      {
        id: 'r1',
        against: entry.id,
        amount: usd(amountMinor),
        on: day('2026-03-08'),
        at: '2026-03-08T10:00:00.000Z',
      },
    ],
  });
  const foodLine = (v: LedgerView) => {
    const line = budgetStatus(v, today).lines.find(
      (l) => l.budget.id === 'food',
    );
    if (line === undefined) throw new Error('no food line');
    return line;
  };

  it('counts only what stayed spent', () => {
    const groceries = spend('2026-03-06', 3_000, food);
    const line = foodLine(
      make([groceries], budgets, refundOf(groceries, 1_000)),
    );
    expect(line.spent).toEqual(usd(2_000));
    expect(line.left).toEqual(usd(8_000));
  });

  it('takes back the overflow first, which the cover restored', () => {
    const big = spend('2026-03-06', 70_000, food);
    const v = make([big], budgets, refundOf(big, 35_000));
    const line = foodLine(v);
    expect(line.spent).toEqual(usd(35_000));
    // $100 was paid by Food itself; the $600 past it shrinks by $350.
    expect(line.overflow).toEqual(usd(25_000));
    expect(line.left).toEqual(usd(0));
  });

  it('gives the budget back its own part once the overflow is refunded', () => {
    const big = spend('2026-03-06', 12_000, food);
    const line = foodLine(make([big], budgets, refundOf(big, 5_000)));
    expect(line.spent).toEqual(usd(7_000));
    expect(line.overflow).toEqual(usd(0));
    expect(line.left).toEqual(usd(3_000));
  });

  it('never refunds more than the entry counted', () => {
    const groceries = spend('2026-03-06', 3_000, food);
    const line = foodLine(
      make([groceries], budgets, refundOf(groceries, 9_000)),
    );
    expect(line.spent).toEqual(usd(0));
  });

  it('lowers spending counted by no budget', () => {
    const rent = spend('2026-03-05', 95_000, other);
    const v = make([rent], budgets, refundOf(rent, 5_000));
    expect(budgetStatus(v, today).unbudgeted).toEqual(usd(90_000));
  });
});

describe('the daily number', () => {
  it('counts what a Buffer cover paid as held money, not spending today', () => {
    const rent = spend('2026-03-05', 95_000, other);
    const groceries = spend('2026-03-10', 14_000, food);
    const v = make(
      [rent, groceries],
      [foodBudget, travelBudget, bufferBudget],
      {},
      {
        settings: settings({ dailyMode: 'free' }),
      },
    );
    const figures = dailyFiguresOn(v, today);
    // Of today's $140, $40 came out of the Buffer's hold.
    expect(figures.dailySpentToday).toEqual(usd(10_000));
  });
});

describe('covered this period and the preview', () => {
  const budgets = [foodBudget, travelBudget, bufferBudget];
  const rent = spend('2026-03-05', 95_000, other);
  const groceries = spend('2026-03-06', 14_000, food);

  it('reports what needed cover and who covered it', () => {
    const v = make([rent, groceries], budgets);
    const status = budgetStatus(v, today);
    expect(status.covered).toEqual({
      // Rent has no budget, so all $950 of it needed cover, free money
      // gave it; Food's $40 shortfall came from the Buffer.
      shortfall: usd(95_000 + 4_000),
      fromFree: usd(95_000),
      fromBuffer: usd(4_000),
      fromBudgets: usd(0),
      uncovered: usd(0),
    });
    expect(status.coverOrder).toEqual([
      'free',
      bufferBudget.id,
      foodBudget.id,
      travelBudget.id,
    ]);
    const covers = budgetCovers(v, today);
    expect(covers.map((c) => c.entryId)).toEqual([groceries.id, rent.id]);
    expect(covers[0]).toMatchObject({
      own: usd(10_000),
      uncovered: usd(0),
      overridden: false,
    });
  });

  it('previews an entry without recording it', () => {
    const v = make([rent], budgets);
    const entry = spend('2026-03-10', 14_000, food);
    const preview = coverPreview(v, today, entry);
    expect(preview).toMatchObject({
      counted: true,
      budgetId: foodBudget.id,
      amount: usd(14_000),
      own: usd(10_000),
      uncovered: usd(0),
      reachesSetAside: true,
      overspend: false,
      needsConfirmation: true,
    });
    expect(preview.covers).toEqual([
      { source: bufferBudget.id, amount: usd(4_000), setAside: true },
    ]);
    expect(preview.leftToday.after.amountMinor).toBeLessThan(
      preview.leftToday.before.amountMinor,
    );
    expect(v.ledger).not.toContain(entry);
  });

  it('needs no second tap when free money covers it', () => {
    const v = make([], budgets);
    const preview = coverPreview(v, today, spend('2026-03-10', 14_000, food));
    expect(preview.needsConfirmation).toBe(false);
    expect(preview.covers).toEqual([
      { source: 'free', amount: usd(4_000), setAside: false },
    ]);
  });

  it('flags an overspend nothing covers', () => {
    const noBuffer = {
      ...bufferBudget,
      amounts: [{ from: day('2026-03-01'), amount: usd(0) }],
    };
    const v = make(
      [spend('2026-03-05', 145_000, other)],
      [foodBudget, noBuffer],
    );
    const preview = coverPreview(v, today, spend('2026-03-10', 14_000, food));
    expect(preview).toMatchObject({
      overspend: true,
      needsConfirmation: true,
      reachesSetAside: false,
      uncovered: usd(4_000),
    });
  });

  it('says so when no budget counts the entry', () => {
    const v = make([], budgets, {}, {});
    const fromSavings = spend('2026-03-10', 1_000, food, savings);
    expect(coverPreview(v, today, fromSavings).counted).toBe(false);
  });
});
