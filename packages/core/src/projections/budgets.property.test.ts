import { addDays, localDate, money } from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { expense } from '../ledger/build.ts';
import { reverse } from '../ledger/reverse.ts';
import { food, meta } from '../ledger/testing.ts';
import {
  categoryId,
  transactionId,
  type Transaction,
} from '../ledger/types.ts';
import { budgetStatus } from './budget-status.ts';
import {
  budgetId,
  heldBy,
  leftOf,
  tagId,
  type Budget,
  type BudgetSetup,
  type DailyMode,
} from './budgets.ts';
import { budgetFold, dailyFiguresOn } from './daily.ts';
import {
  card,
  cash,
  chart,
  openingUsd,
  paycheck,
  savings,
  settings,
  view,
} from './testing.ts';
import type { LedgerView } from './types.ts';

// Budget invariants over random ledgers (ADR 0021): an entry counts toward
// at most one budget, free money is available less holds, a leftover never
// carries below zero, and no budgets leaves the daily number as it was.
// fast-check prints the seed of any failure.

const groceries = categoryId('groceries');
const travel = categoryId('travel');
const other = categoryId('other');
const categories = [food, groceries, travel, other];
const trip = tagId('trip');
const march = localDate('2026-03-01');

const categoryMap = new Map([
  [food, { parent: null, mergedInto: null }],
  [groceries, { parent: food, mergedInto: null }],
  [travel, { parent: null, mergedInto: null }],
  [other, { parent: null, mergedInto: null }],
]);

type Spend = {
  offset: number;
  account: typeof card;
  amount: number;
  category: (typeof categories)[number];
  tagged: boolean;
  undone: boolean;
};

const spendArb: fc.Arbitrary<Spend> = fc.record({
  offset: fc.nat(40),
  account: fc.constantFrom(card, cash, savings),
  amount: fc.integer({ min: 1, max: 60_000 }),
  category: fc.constantFrom(...categories),
  tagged: fc.boolean(),
  undone: fc.boolean(),
});

// Built once so every view of a run shares the same entry IDs.
const fixed: readonly Transaction[] = [
  openingUsd('2026-02-18', 400_000, card),
  openingUsd('2026-02-18', 100_000, cash),
  openingUsd('2026-02-18', 80_000, savings),
  paycheck('2026-03-01', 250_000),
  paycheck('2026-04-01', 250_000),
];

function ledgerOf(spends: readonly Spend[]) {
  const ledger: Transaction[] = [...fixed];
  const tags = new Map<Transaction['id'], (typeof trip)[]>();
  spends.forEach((s, i) => {
    const entry = expense(
      chart,
      {
        id: transactionId(`s${String(i).padStart(4, '0')}`),
        occurredOn: addDays(march, s.offset),
        createdAt: `2026-05-01T00:00:00.${String(i).padStart(3, '0')}Z`,
      },
      {
        accountId: s.account,
        amount: money(s.amount, 'USD'),
        categoryId: s.category,
      },
    );
    ledger.push(entry);
    if (s.tagged) tags.set(entry.id, [trip]);
    if (s.undone) {
      ledger.push(
        reverse(chart, ledger, entry.id, {
          id: transactionId(`u${String(i).padStart(4, '0')}`),
          createdAt: `2026-05-02T00:00:00.${String(i).padStart(3, '0')}Z`,
        }),
      );
    }
  });
  return { ledger, tags };
}

type BudgetSpec = {
  target: 'food' | 'groceries' | 'travel' | 'trip';
  amount: number;
  mode: 'daily' | 'set-aside';
  leftover: 'free' | 'carry';
  start: number;
};

const budgetsArb = fc.uniqueArray(
  fc.record({
    target: fc.constantFrom(
      'food' as const,
      'groceries' as const,
      'travel' as const,
      'trip' as const,
    ),
    amount: fc.integer({ min: 0, max: 200_000 }),
    mode: fc.constantFrom('daily' as const, 'set-aside' as const),
    leftover: fc.constantFrom('free' as const, 'carry' as const),
    start: fc.nat(30),
  }),
  { selector: (b) => b.target, maxLength: 4 },
);

function budgetsOf(specs: readonly BudgetSpec[]): Budget[] {
  return specs.map((s, i): Budget => {
    const startedOn = addDays(march, s.start);
    return {
      id: budgetId(`b${String(i)}`),
      name: `b${String(i)}`,
      target:
        s.target === 'trip'
          ? { kind: 'tag', tagId: trip }
          : {
              kind: 'category',
              categoryId: { food, groceries, travel }[s.target],
            },
      mode: s.mode,
      leftover: s.leftover,
      startedOn,
      endedOn: null,
      amounts: [{ from: startedOn, amount: money(s.amount, 'USD') }],
    };
  });
}

const buffer: Budget = {
  id: budgetId('buffer'),
  name: 'Buffer',
  target: { kind: 'buffer' },
  mode: 'set-aside',
  leftover: 'carry',
  startedOn: march,
  endedOn: null,
  amounts: [{ from: march, amount: money(0, 'USD') }],
};

const modes: DailyMode[] = ['free', 'pool-minus-bills', 'daily-budgets'];
const todayArb = fc.nat(45).map((n) => addDays(localDate('2026-03-05'), n));

function make(
  spends: readonly Spend[],
  budgets: readonly Budget[],
  overrides: Partial<LedgerView> = {},
): LedgerView {
  const { ledger, tags } = ledgerOf(spends);
  const setup: BudgetSetup = {
    budgets,
    categories: categoryMap,
    entryTags: tags,
  };
  return view(ledger, { budgets: setup, ...overrides });
}

const spendsArb = fc.array(spendArb, { maxLength: 14 });

describe('budget properties', () => {
  it('counts each expense line toward at most one budget, and all of it somewhere', () => {
    fc.assert(
      fc.property(spendsArb, budgetsArb, todayArb, (spends, specs, today) => {
        const v = make(spends, budgetsOf(specs));
        const fold = budgetFold(v, today);
        if (fold === null) return;
        const inPeriod = fold.spend.filter(
          (l) => l.date >= fold.period.from && l.date < fold.period.to,
        );
        for (const line of fold.lines) {
          const counted = inPeriod
            .filter((l) => l.budgetId === line.budget.id)
            .reduce((sum, l) => sum + l.amount, 0n);
          expect(line.spent).toBe(counted);
        }
        const budgeted = fold.lines.reduce((sum, l) => sum + l.spent, 0n);
        const total = inPeriod.reduce((sum, l) => sum + l.amount, 0n);
        expect(budgeted + fold.unbudgeted).toBe(total);
        for (const l of fold.spend) {
          expect(l.fromHold >= 0n && l.fromHold <= l.amount).toBe(true);
        }
      }),
    );
  });

  it('keeps free money equal to available less the holds', () => {
    fc.assert(
      fc.property(spendsArb, budgetsArb, todayArb, (spends, specs, today) => {
        const v = make(spends, [...budgetsOf(specs), buffer]);
        const status = budgetStatus(v, today);
        expect(status.free.amountMinor).toBe(
          status.available.amountMinor - status.held.amountMinor,
        );
        const fold = budgetFold(v, today);
        const held = (fold?.lines ?? []).reduce((s, l) => s + heldBy(l), 0n);
        expect(BigInt(status.held.amountMinor)).toBe(held);
        for (const l of fold?.lines ?? []) {
          expect(heldBy(l) >= 0n).toBe(true);
          expect(l.carriedIn >= 0n).toBe(true);
          if (l.budget.mode === 'daily') expect(heldBy(l)).toBe(0n);
          expect(heldBy(l) <= l.amount + l.carriedIn).toBe(true);
          // A shortfall is covered by another source, not left as debt.
          expect(leftOf(l) >= 0n).toBe(true);
        }
      }),
    );
  });

  it('leaves the daily number as it was when there are no budgets', () => {
    fc.assert(
      fc.property(spendsArb, todayArb, (spends, today) => {
        const plain = make(spends, []);
        const withoutBudgets: LedgerView = {
          chart: plain.chart,
          ledger: plain.ledger,
          paycheckCategories: plain.paycheckCategories,
          settings: plain.settings,
          bills: plain.bills,
          rates: plain.rates,
        };
        expect(dailyFiguresOn(plain, today)).toEqual(
          dailyFiguresOn(withoutBudgets, today),
        );
        expect(dailyFiguresOn(make(spends, [buffer]), today)).toEqual(
          dailyFiguresOn(withoutBudgets, today),
        );
      }),
    );
  });

  it('does not depend on the order the ledger arrives in', () => {
    fc.assert(
      fc.property(
        spendsArb,
        budgetsArb,
        todayArb,
        fc.constantFrom(...modes),
        (spends, specs, today, dailyMode) => {
          const v = make(spends, budgetsOf(specs), {
            settings: settings({ dailyMode }),
          });
          const shuffled = { ...v, ledger: [...v.ledger].reverse() };
          expect(budgetStatus(shuffled, today)).toEqual(budgetStatus(v, today));
          expect(dailyFiguresOn(shuffled, today)).toEqual(
            dailyFiguresOn(v, today),
          );
        },
      ),
    );
  });

  it('keeps daily budgets out of the free-money daily number', () => {
    fc.assert(
      fc.property(spendsArb, budgetsArb, todayArb, (spends, specs, today) => {
        const daily = budgetsOf(specs).map((b): Budget => ({
          ...b,
          mode: 'daily',
        }));
        const a = dailyFiguresOn(make(spends, [buffer]), today);
        const b = dailyFiguresOn(make(spends, [...daily, buffer]), today);
        expect(b.liveDaily).toEqual(a.liveDaily);
        expect(b.todayAllowance).toEqual(a.todayAllowance);
        expect(b.leftToday).toEqual(a.leftToday);
      }),
    );
  });

  it('lets spending inside a set-aside hold leave the daily number alone', () => {
    fc.assert(
      fc.property(
        spendsArb,
        fc.integer({ min: 1, max: 50_000 }),
        fc.integer({ min: 0, max: 25 }),
        (spends, amount, offset) => {
          const today = addDays(march, 5 + offset);
          const big: Budget = {
            ...buffer,
            id: budgetId('travel'),
            name: 'Travel',
            target: { kind: 'category', categoryId: travel },
            amounts: [{ from: march, amount: money(10_000_000, 'USD') }],
          };
          // Only spending outside the Travel category and tag, so the hold
          // is untouched before the extra entry.
          const rest = spends.filter((s) => s.category !== travel && !s.tagged);
          const before = make(rest, [big]);
          const { ledger } = ledgerOf(rest);
          const extra = expense(chart, meta(today), {
            accountId: card,
            amount: money(amount, 'USD'),
            categoryId: travel,
          });
          const after = make(rest, [big], { ledger: [...ledger, extra] });
          const a = dailyFiguresOn(before, today);
          const b = dailyFiguresOn(after, today);
          expect(b.liveDaily).toEqual(a.liveDaily);
          expect(b.leftToday).toEqual(a.leftToday);
          expect(b.todayAllowance).toEqual(a.todayAllowance);
        },
      ),
    );
  });

  it('has no effect on spending outside the counted accounts', () => {
    fc.assert(
      fc.property(spendsArb, todayArb, (spends, today) => {
        const onlySavings = spends.map((s) => ({ ...s, account: savings }));
        const v = make(onlySavings, [
          budgetsOf([
            {
              target: 'food',
              amount: 1,
              mode: 'daily',
              leftover: 'free',
              start: 0,
            },
          ])[0] ?? buffer,
        ]);
        expect(budgetStatus(v, today).lines[0]?.spent).toEqual(money(0, 'USD'));
      }),
    );
  });
});
