import {
  addDays,
  currencyCode,
  localDate,
  money,
  parseRate,
  type LocalDate,
} from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  expense,
  income,
  opening,
  transfer,
  writeOff,
} from '../ledger/build.ts';
import { reverse } from '../ledger/reverse.ts';
import { food, salary, testChart, testCurrencies } from '../ledger/testing.ts';
import {
  accountId,
  transactionId,
  type Account,
  type Transaction,
} from '../ledger/types.ts';
import { cyclesOf } from './cycles.ts';
import { availableOn, dailyFiguresOn, leftTodayDrop } from './daily.ts';
import { cycleReports } from './history.ts';
import { cycleSnapshot } from './snapshot.ts';
import {
  billId,
  type Bill,
  type ExchangeRate,
  type LedgerView,
} from './types.ts';

// Invariants 5 and 8, FR-C6 and amended history over random ledgers spanning three months,
// with paychecks, bills, other currencies and undos. fast-check prints the
// seed of any failure.

const chart = testChart();
const userAccounts = [...chart.values()].filter((a) => a.systemRole === null);
const start = localDate('2026-02-01');
const days = Array.from({ length: 90 }, (_, i) => addDays(start, i));
const usd = currencyCode('USD');
const card = accountId('card-USD');

const rates: ExchangeRate[] = testCurrencies
  .filter((c) => c !== usd)
  .map((base, i) => ({
    base,
    quote: usd,
    rate: parseRate(['1.1', '0.0067', '3.25'][i] ?? '1'),
    asOf: start,
  }));

type Op =
  | { t: 'spend' | 'earn' | 'paycheck'; account: Account; amount: number }
  | {
      t: 'transfer';
      from: Account;
      to: Account;
      sent: number;
      received: number;
    }
  | { t: 'opening'; account: Account; amount: number }
  | { t: 'reverse'; pick: number };

const accountArb = fc.constantFrom(...userAccounts);
const amountArb = fc.integer({ min: 1, max: 1e8 });
const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.record({
    t: fc.constantFrom('spend' as const, 'earn' as const, 'paycheck' as const),
    account: accountArb,
    amount: amountArb,
  }),
  fc.record({
    t: fc.constant('transfer' as const),
    from: accountArb,
    to: accountArb,
    sent: amountArb,
    received: amountArb,
  }),
  fc.record({
    t: fc.constant('opening' as const),
    account: accountArb,
    amount: amountArb,
  }),
  fc.record({ t: fc.constant('reverse' as const), pick: fc.nat() }),
);

function build(ops: readonly (readonly [Op, LocalDate])[]): Transaction[] {
  const ledger: Transaction[] = [];
  ops.forEach(([op, occurredOn], i) => {
    const meta = {
      id: transactionId(`t${String(i).padStart(4, '0')}`),
      occurredOn,
      createdAt: `2026-05-01T00:00:${String(i % 60).padStart(2, '0')}.${String(i).padStart(3, '0')}Z`,
    };
    const own = (account: Account, amount: number) =>
      money(amount, account.currency);
    switch (op.t) {
      case 'spend':
      case 'earn':
      case 'paycheck': {
        const make = op.t === 'spend' ? expense : income;
        ledger.push(
          make(chart, meta, {
            accountId: op.account.id,
            amount: own(op.account, op.amount),
            categoryId: op.t === 'spend' ? food : salary,
          }),
        );
        break;
      }
      case 'transfer':
        if (op.from.id === op.to.id) return;
        ledger.push(
          transfer(chart, meta, {
            fromId: op.from.id,
            toId: op.to.id,
            sent: own(op.from, op.sent),
            received: own(
              op.to,
              op.from.currency === op.to.currency ? op.sent : op.received,
            ),
          }),
        );
        break;
      case 'opening':
        ledger.push(
          opening(chart, meta, {
            accountId: op.account.id,
            amount: own(op.account, op.amount),
          }),
        );
        break;
      case 'reverse': {
        const candidates = ledger.filter(
          (t) =>
            t.kind !== 'reversal' && !ledger.some((r) => r.reversesId === t.id),
        );
        const target = candidates[op.pick % Math.max(1, candidates.length)];
        if (target === undefined) return;
        ledger.push(reverse(chart, ledger, target.id, meta));
        break;
      }
    }
  });
  return ledger;
}

const dayArb = fc.constantFrom(...days);
const ledgerArb = fc
  .array(fc.tuple(opArb, dayArb), { maxLength: 40 })
  .map(build);

const viewArb = fc
  .record({
    ledger: ledgerArb,
    paydayDay: fc.integer({ min: 1, max: 31 }),
    billDay: fc.integer({ min: 1, max: 31 }),
    billAmount: amountArb,
    paidOffset: fc.option(fc.integer({ min: 0, max: 10 })),
    startedOn: dayArb,
  })
  .map(
    ({
      ledger,
      paydayDay,
      billDay,
      billAmount,
      paidOffset,
      startedOn,
    }): LedgerView => ({
      chart,
      ledger,
      paycheckCategories: new Set([salary]),
      settings: {
        defaultCurrency: usd,
        startedOn,
        paydayDay,
        paydayOverride: null,
      },
      bills: [
        {
          id: billId('rent'),
          amount: money(billAmount, 'USD'),
          dueDay: billDay,
          payments:
            paidOffset === null
              ? []
              : days
                  .filter((d) =>
                    d.endsWith(`-${String(billDay).padStart(2, '0')}`),
                  )
                  .map((dueOn) => ({
                    dueOn,
                    paidOn: addDays(dueOn, -paidOffset),
                  })),
        },
      ],
      rates,
    }),
  );

const todayArb = fc.constantFrom(...days);

describe('cycle properties', () => {
  it('has exactly one open cycle, and cycles follow each other', () => {
    fc.assert(
      fc.property(viewArb, todayArb, (view, today) => {
        const cycles = cyclesOf(view, today);
        expect(cycles.filter((c) => c.closedOn === null)).toHaveLength(1);
        expect(cycles.at(-1)?.closedOn).toBeNull();
        cycles.slice(1).forEach((cycle, i) => {
          expect(cycles[i]?.closedOn).toBe(cycle.openedOn);
          expect(cycle.openedOn > (cycles[i]?.openedOn ?? '')).toBe(true);
          expect(cycle.openedOn <= today).toBe(true);
        });
      }),
    );
  });
});

function shuffled<T>(items: readonly T[], seed: number): T[] {
  const copy = [...items];
  let state = seed;
  for (let i = copy.length - 1; i > 0; i -= 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const j = state % (i + 1);
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

describe('replay properties', () => {
  it('gives the same figures for any insertion order', () => {
    fc.assert(
      fc.property(viewArb, todayArb, fc.nat(), (view, today, seed) => {
        const replayed = { ...view, ledger: shuffled(view.ledger, seed) };
        expect(dailyFiguresOn(replayed, today)).toEqual(
          dailyFiguresOn(view, today),
        );
        const cycles = cyclesOf(view, today);
        expect(cyclesOf(replayed, today)).toEqual(cycles);
        for (const cycle of cycles) {
          expect(cycleSnapshot(replayed, cycle, today)).toEqual(
            cycleSnapshot(view, cycle, today),
          );
        }
      }),
    );
  });

  it('applies a back-dated expense to that day and every day after', () => {
    fc.assert(
      fc.property(
        viewArb,
        todayArb,
        dayArb,
        amountArb,
        (view, today, date, amount) => {
          fc.pre(date <= today);
          const late = expense(
            chart,
            {
              id: transactionId('late'),
              occurredOn: date,
              createdAt: '2026-06-01T00:00:00.000Z',
            },
            { accountId: card, amount: money(amount, 'USD'), categoryId: food },
          );
          const after = { ...view, ledger: [...view.ledger, late] };

          for (const d of days.filter((d) => d <= today)) {
            const change =
              availableOn(after, d, today).amount.amountMinor -
              availableOn(view, d, today).amount.amountMinor;
            expect(change).toBe(d >= date ? -amount : 0);
          }

          const was = dailyFiguresOn(view, today);
          const now = dailyFiguresOn(after, today);
          const spentToday = date === today ? amount : 0;
          expect(now.cycle).toEqual(was.cycle);
          expect(now.spentToday.amountMinor).toBe(
            was.spentToday.amountMinor + spentToday,
          );
          expect(now.startOfDay.amountMinor).toBe(
            was.startOfDay.amountMinor - amount + spentToday,
          );
          expect(now.leftToday.amountMinor).toBe(
            now.todayAllowance.amountMinor - now.spentToday.amountMinor,
          );
          expect(now.todayAllowance.amountMinor).toBe(
            Math.floor(now.startOfDay.amountMinor / now.daysLeft),
          );
        },
      ),
    );
  });

  it('marks only the closed cycle a later entry is dated in as amended', () => {
    fc.assert(
      fc.property(
        viewArb,
        todayArb,
        dayArb,
        amountArb,
        (view, today, date, amount) => {
          fc.pre(date <= today);
          // An import records every row at one instant: nothing is amended.
          const imported = {
            ...view,
            ledger: view.ledger.map((t) => ({
              ...t,
              createdAt: '2026-05-01T00:00:00.000Z',
            })),
          };
          for (const report of cycleReports(imported, today)) {
            expect(report.amendments).toEqual([]);
          }

          const late = expense(
            chart,
            {
              id: transactionId('late'),
              occurredOn: date,
              createdAt: '2026-06-01T00:00:00.000Z',
            },
            { accountId: card, amount: money(amount, 'USD'), categoryId: food },
          );
          const after = { ...imported, ledger: [...imported.ledger, late] };
          for (const report of cycleReports(after, today)) {
            const { openedOn, closedOn } = report.cycle;
            const holds =
              closedOn !== null && date >= openedOn && date < closedOn;
            expect(report.amendments.map((a) => a.transactionId)).toEqual(
              holds ? ['late'] : [],
            );
          }
        },
      ),
    );
  });
});

describe('pace properties', () => {
  it('leaves out exactly the linked bill payments, adjustments and their undos', () => {
    fc.assert(
      fc.property(
        viewArb,
        todayArb,
        fc.array(fc.boolean(), { maxLength: 40 }),
        fc.array(fc.boolean(), { maxLength: 40 }),
        (view, today, linkPicks, adjustPicks) => {
          const expenses = view.ledger.filter((t) => t.kind === 'expense');
          const linked = expenses.filter((_, i) => linkPicks[i] === true);
          const adjustments = expenses.filter(
            (_, i) => adjustPicks[i] === true,
          );
          const payer: Bill = {
            id: billId('payer'),
            amount: money(1, 'USD'),
            dueDay: 1,
            payments: linked.map((t) => ({
              dueOn: t.occurredOn,
              paidOn: t.occurredOn,
              transactionId: t.id,
            })),
          };
          const marked: LedgerView = {
            ...view,
            bills: [...view.bills, payer],
            reconcileAdjustments: new Set(adjustments.map((t) => t.id)),
          };
          const left = new Set([...linked, ...adjustments].map((t) => t.id));
          const without: LedgerView = {
            ...view,
            ledger: view.ledger.filter(
              (t) =>
                !left.has(t.id) &&
                (t.reversesId === null || !left.has(t.reversesId)),
            ),
          };
          const figures = dailyFiguresOn(marked, today);
          // Marking entries never changes what is spent or available.
          const unmarked = dailyFiguresOn(
            { ...view, bills: marked.bills },
            today,
          );
          expect(figures.cycleSpent).toEqual(unmarked.cycleSpent);
          expect(figures.available).toEqual(unmarked.available);
          // Pace spending is cycle spending without them.
          expect(figures.paceSpent).toEqual(
            dailyFiguresOn(without, today).cycleSpent,
          );
        },
      ),
    );
  });

  it('keeps pace spending when a bill is paid or a difference adjusted', () => {
    fc.assert(
      fc.property(
        viewArb,
        todayArb,
        dayArb,
        amountArb,
        fc.boolean(),
        (view, today, date, amount, isBill) => {
          fc.pre(date <= today);
          const paid = expense(
            chart,
            {
              id: transactionId('paid'),
              occurredOn: date,
              createdAt: '2026-06-01T00:00:00.000Z',
            },
            { accountId: card, amount: money(amount, 'USD'), categoryId: food },
          );
          const after: LedgerView = isBill
            ? {
                ...view,
                ledger: [...view.ledger, paid],
                bills: [
                  ...view.bills,
                  {
                    id: billId('phone'),
                    amount: money(amount, 'USD'),
                    dueDay: Number(date.slice(8)),
                    payments: [
                      { dueOn: date, paidOn: date, transactionId: paid.id },
                    ],
                  },
                ],
              }
            : {
                ...view,
                ledger: [...view.ledger, paid],
                reconcileAdjustments: new Set([paid.id]),
              };
          const was = dailyFiguresOn(view, today);
          const now = dailyFiguresOn(after, today);
          expect(now.cycle).toEqual(was.cycle);
          expect(now.paceSpent).toEqual(was.paceSpent);
          const inCycle = date >= now.cycle.openedOn;
          expect(now.cycleSpent.amountMinor).toBe(
            was.cycleSpent.amountMinor + (inCycle ? amount : 0),
          );
        },
      ),
    );
  });
});

describe('archive impact properties', () => {
  const settleMeta = (today: LocalDate) => ({
    id: transactionId('settle'),
    occurredOn: today,
    createdAt: '2026-06-01T00:00:00.000Z',
  });

  it('drops left today by a whole write-off from an on-budget account', () => {
    fc.assert(
      fc.property(viewArb, todayArb, amountArb, (view, today, amount) => {
        const entry = writeOff(chart, settleMeta(today), {
          accountId: card,
          balance: money(amount, 'USD'),
        });
        expect(leftTodayDrop(view, today, entry)).toEqual(money(amount, usd));
      }),
    );
  });

  it('drops left today by at most a transfer to savings, never within the budget', () => {
    fc.assert(
      fc.property(viewArb, todayArb, amountArb, (view, today, amount) => {
        const move = (toId: typeof card) =>
          transfer(chart, settleMeta(today), {
            fromId: card,
            toId,
            sent: money(amount, 'USD'),
          });
        const toSavings = leftTodayDrop(
          view,
          today,
          move(accountId('savings-USD')),
        ).amountMinor;
        expect(toSavings).toBeGreaterThanOrEqual(0);
        expect(toSavings).toBeLessThanOrEqual(amount);
        expect(
          leftTodayDrop(view, today, move(accountId('cash-USD'))).amountMinor,
        ).toBe(0);
      }),
    );
  });
});
