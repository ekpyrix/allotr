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
import { expense, income, opening, transfer } from '../ledger/build.ts';
import { reverse } from '../ledger/reverse.ts';
import { food, salary, testChart, testCurrencies } from '../ledger/testing.ts';
import {
  accountId,
  transactionId,
  type Account,
  type Transaction,
} from '../ledger/types.ts';
import { cyclesOf } from './cycles.ts';
import { availableOn, dailyFiguresOn } from './daily.ts';
import { cycleSnapshot } from './snapshot.ts';
import { billId, type ExchangeRate, type LedgerView } from './types.ts';

// Invariants 5 and 8 and FR-C6 over random ledgers spanning three months,
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
});
