import { addDays, localDate, money } from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { expense } from '../ledger/build.ts';
import { food } from '../ledger/testing.ts';
import { transactionId, type Transaction } from '../ledger/types.ts';
import {
  emergencyFund,
  netWorthOn,
  netWorthSeries,
  paydayPlan,
  savingsLine,
  weeklyReview,
} from './plan.ts';
import { card, chart, openingUsd, paycheck, savings, view } from './testing.ts';

// Invariants of the payday plan and insights over random ledgers: savings
// lines never exceed the paycheck, net worth is the sum of the accounts on
// every day, and the emergency fund never reports more progress than 100%.

const start = localDate('2026-02-18');
const fixed: readonly Transaction[] = [
  openingUsd('2026-02-18', 300_000, card),
  openingUsd('2026-02-18', 90_000, savings),
  paycheck('2026-03-01', 200_000),
  paycheck('2026-04-01', 200_000),
  paycheck('2026-05-01', 200_000),
];

const spendArb = fc.record({
  offset: fc.nat(100),
  amount: fc.integer({ min: 1, max: 80_000 }),
  account: fc.constantFrom(card, savings),
});

function ledgerOf(
  spends: readonly { offset: number; amount: number; account: typeof card }[],
) {
  return [
    ...fixed,
    ...spends.map((s, i) =>
      expense(
        chart,
        {
          id: transactionId(`s${String(i).padStart(4, '0')}`),
          occurredOn: addDays(start, s.offset),
          createdAt: `2026-06-01T00:00:00.${String(i).padStart(3, '0')}Z`,
        },
        {
          accountId: s.account,
          amount: money(s.amount, 'USD'),
          categoryId: food,
        },
      ),
    ),
  ];
}

const todayArb = fc.nat(110).map((n) => addDays(start, n));

describe('plan properties', () => {
  it('never sets aside more than the paycheck, or less than nothing', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5_000_000 }),
        fc.integer({ min: 0, max: 5_000_000 }),
        fc.integer({ min: 0, max: 10_000 }),
        (income, fixedAmount, basisPoints) => {
          for (const rule of [
            { kind: 'fixed' as const, amount: money(fixedAmount, 'USD') },
            { kind: 'percent' as const, basisPoints },
          ]) {
            const line = savingsLine(rule, money(income, 'USD')).amountMinor;
            expect(line >= 0 && line <= income).toBe(true);
          }
        },
      ),
    );
  });

  it('keeps net worth at the sum of the accounts on every day', () => {
    fc.assert(
      fc.property(
        fc.array(spendArb, { maxLength: 10 }),
        todayArb,
        (spends, today) => {
          const v = view(ledgerOf(spends));
          const { points } = netWorthSeries(v, start, today);
          expect(points).toHaveLength(
            Math.round((Date.parse(today) - Date.parse(start)) / 86_400_000) +
              1,
          );
          for (const p of points) {
            expect(p.amount).toEqual(netWorthOn(v, p.date).amount);
          }
        },
      ),
    );
  });

  it('splits the paycheck into savings and what is left to plan', () => {
    fc.assert(
      fc.property(
        fc.array(spendArb, { maxLength: 10 }),
        todayArb,
        fc.integer({ min: 0, max: 10_000 }),
        (spends, today, basisPoints) => {
          const v = view(ledgerOf(spends), {
            settings: {
              ...view([]).settings,
              payYourselfFirst: { kind: 'percent', basisPoints },
            },
          });
          const plan = paydayPlan(v, today);
          expect(plan.savings.amountMinor + plan.toPlan.amountMinor).toBe(
            plan.income.amountMinor,
          );
          expect(plan.toPlan.amountMinor >= 0).toBe(true);
        },
      ),
    );
  });

  it('keeps emergency progress within 100% and the target at months of expenses', () => {
    fc.assert(
      fc.property(
        fc.array(spendArb, { maxLength: 10 }),
        todayArb,
        (spends, today) => {
          const fund = emergencyFund(view(ledgerOf(spends)), today);
          expect(
            fund.progressBasisPoints >= 0 && fund.progressBasisPoints <= 10_000,
          ).toBe(true);
          expect(fund.target.amountMinor).toBe(
            fund.monthlyExpenses.amountMinor * fund.months,
          );
          expect(fund.targetHigh.amountMinor).toBe(
            fund.targetLow.amountMinor * 2,
          );
        },
      ),
    );
  });

  it('is the same whatever order the ledger arrives in', () => {
    fc.assert(
      fc.property(
        fc.array(spendArb, { maxLength: 10 }),
        todayArb,
        (spends, today) => {
          const v = view(ledgerOf(spends));
          const r = { ...v, ledger: [...v.ledger].reverse() };
          expect(weeklyReview(r, today)).toEqual(weeklyReview(v, today));
          expect(emergencyFund(r, today)).toEqual(emergencyFund(v, today));
          expect(paydayPlan(r, today)).toEqual(paydayPlan(v, today));
        },
      ),
    );
  });
});
