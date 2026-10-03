import { money } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { food } from '../ledger/testing.ts';
import { categoryId } from '../ledger/types.ts';
import { budgetId, type Budget, type BudgetSetup } from './budgets.ts';
import {
  emergencyFund,
  netWorthOn,
  netWorthSeries,
  paydayPlan,
  savingsLine,
  weeklyReview,
} from './plan.ts';
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

// Payday plan and insights with made-up amounts. The user joined on 18
// February; paychecks on 1 March and 1 April close two cycles. Food costs
// $300 in the first, $600 in the second, plus $120 of Travel in the second.

const travel = categoryId('travel');
const usd = (amountMinor: number) => money(amountMinor, 'USD');

const ledger = [
  openingUsd('2026-02-18', 300_000),
  openingUsd('2026-02-18', 80_000, savings),
  spend('2026-02-25', 30_000, food),
  paycheck('2026-03-01', 200_000),
  spend('2026-03-10', 60_000, food),
  spend('2026-03-12', 12_000, travel),
  paycheck('2026-04-01', 200_000),
  spend('2026-04-02', 5_000, food),
];

const foodBudget: Budget = {
  id: budgetId('food'),
  name: 'Food',
  target: { kind: 'category', categoryId: food },
  mode: 'daily',
  leftover: 'free',
  startedOn: day('2026-03-01'),
  endedOn: null,
  amounts: [{ from: day('2026-03-01'), amount: usd(90_000) }],
};
const setup: BudgetSetup = {
  budgets: [foodBudget],
  categories: new Map([
    [food, { parent: null, mergedInto: null }],
    [travel, { parent: null, mergedInto: null }],
  ]),
  entryTags: new Map(),
};

function make(extra: Partial<LedgerView['settings']> = {}): LedgerView {
  return view(ledger, { budgets: setup, settings: settings(extra) });
}

const today = day('2026-04-02');

describe('savingsLine', () => {
  it('takes a fixed amount, never more than the paycheck', () => {
    expect(
      savingsLine({ kind: 'fixed', amount: usd(30_000) }, usd(200_000)),
    ).toEqual(usd(30_000));
    expect(
      savingsLine({ kind: 'fixed', amount: usd(300_000) }, usd(200_000)),
    ).toEqual(usd(200_000));
  });

  it('takes a share of the paycheck, rounded down', () => {
    expect(
      savingsLine({ kind: 'percent', basisPoints: 1_000 }, usd(200_000)),
    ).toEqual(usd(20_000));
    expect(
      savingsLine({ kind: 'percent', basisPoints: 3_333 }, usd(100)),
    ).toEqual(usd(33));
  });

  it('is zero without a rule or in another currency', () => {
    expect(savingsLine(null, usd(5_000))).toEqual(usd(0));
    expect(
      savingsLine({ kind: 'fixed', amount: money(100, 'EUR') }, usd(5_000)),
    ).toEqual(usd(0));
  });
});

describe('paydayPlan', () => {
  it('puts the savings line first, then the budgets prefilled', () => {
    const plan = paydayPlan(
      make({ payYourselfFirst: { kind: 'percent', basisPoints: 1_000 } }),
      today,
    );
    expect(plan.income).toEqual(usd(200_000));
    expect(plan.savings).toEqual(usd(20_000));
    expect(plan.toPlan).toEqual(usd(180_000));
    expect(plan.historyCycles).toBe(2);
    expect(plan.lines).toEqual([
      {
        budgetId: foodBudget.id,
        categoryId: food,
        tagId: null,
        current: usd(90_000),
        // ($300 + $600) over two closed cycles.
        suggested: usd(45_000),
        prefill: usd(90_000),
      },
      {
        budgetId: null,
        categoryId: travel,
        tagId: null,
        current: usd(0),
        suggested: usd(6_000),
        prefill: usd(6_000),
      },
    ]);
  });

  it('fills a budget with no plan yet from the suggestion', () => {
    const unplanned = {
      ...foodBudget,
      amounts: [{ from: day('2026-03-01'), amount: usd(0) }],
    };
    const plan = paydayPlan(
      view(ledger, { budgets: { ...setup, budgets: [unplanned] } }),
      today,
    );
    expect(plan.lines[0]).toMatchObject({
      current: usd(0),
      prefill: usd(45_000),
    });
  });

  it('has no suggestions before a cycle has closed', () => {
    const plan = paydayPlan(
      view(
        [openingUsd('2026-02-18', 100_000), spend('2026-02-19', 1_000, food)],
        {
          budgets: setup,
        },
      ),
      day('2026-02-20'),
    );
    expect(plan.historyCycles).toBe(0);
    expect(plan.lines.every((l) => l.suggested.amountMinor === 0)).toBe(true);
  });
});

describe('emergencyFund', () => {
  it('sets months of average expenses against what the savings hold', () => {
    const fund = emergencyFund(make(), today);
    expect(fund).toMatchObject({
      monthlyExpenses: usd(51_000),
      months: 3,
      target: usd(153_000),
      targetLow: usd(153_000),
      targetHigh: usd(306_000),
      saved: usd(80_000),
      progressBasisPoints: 5_228,
      monthsCovered: 1.5,
    });
  });

  it('follows the months the user chose', () => {
    expect(emergencyFund(make({ emergencyMonths: 6 }), today).target).toEqual(
      usd(306_000),
    );
  });

  it('has no target without history', () => {
    const fund = emergencyFund(
      view([openingUsd('2026-02-18', 1_000, savings)]),
      day('2026-02-20'),
    );
    expect(fund).toMatchObject({
      target: usd(0),
      progressBasisPoints: 0,
      monthsCovered: null,
    });
  });
});

describe('net worth', () => {
  it('adds every account, savings included', () => {
    // $3,000 + $800 + $2,000 + $2,000 less $1,200 + $50 of spending.
    expect(netWorthOn(make(), today).amount).toEqual(
      usd(300_000 + 80_000 + 400_000 - 30_000 - 60_000 - 12_000 - 5_000),
    );
  });

  it('gives one point a day that matches the figure for that day', () => {
    const v = make();
    const { points } = netWorthSeries(v, day('2026-02-15'), today);
    expect(points).toHaveLength(47);
    expect(points[0]?.amount).toEqual(usd(0));
    for (const p of points) {
      expect(p.amount).toEqual(netWorthOn(v, p.date).amount);
    }
  });
});

describe('weeklyReview', () => {
  it('sums the week and the week before, with the biggest categories', () => {
    const v = view(
      [
        openingUsd('2026-03-01', 500_000),
        spend('2026-03-02', 4_000, food),
        spend('2026-03-09', 9_000, food),
        spend('2026-03-10', 3_000, travel),
        spend('2026-03-12', 1_000, food),
      ],
      { budgets: setup },
    );
    const review = weeklyReview(v, day('2026-03-12'));
    expect(review).toMatchObject({
      from: '2026-03-06',
      to: '2026-03-12',
      spent: usd(13_000),
      previousSpent: usd(4_000),
      entries: 3,
    });
    expect(
      review.topCategories.map((c) => [c.categoryId, c.amount.amountMinor]),
    ).toEqual([
      [food, 10_000],
      [travel, 3_000],
    ]);
  });
});
