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
import { expense, income, transfer } from '../ledger/build.ts';
import { reverse } from '../ledger/reverse.ts';
import { food, salary, testChart, testCurrencies } from '../ledger/testing.ts';
import {
  accountId,
  transactionId,
  type Account,
  type Transaction,
} from '../ledger/types.ts';
import { cycleAllocation } from './allocation.ts';
import { dailyFiguresOn } from './daily.ts';
import { billId, type ExchangeRate, type LedgerView } from './types.ts';

// The five parts of the cycle allocation always add up to its start, whatever
// the ledger holds (docs/domain.md "Cycle allocation"). fast-check prints the
// seed of any failure.

const chart = testChart();
const allAccounts = [...chart.values()].filter((a) => a.systemRole === null);
const usdAccounts = allAccounts.filter((a) => a.currency === 'USD');
const start = localDate('2026-02-01');
const days = Array.from({ length: 90 }, (_, i) => addDays(start, i));
const usd = currencyCode('USD');

const rates: ExchangeRate[] = testCurrencies
  .filter((c) => c !== usd)
  .map((base, i) => ({
    base,
    quote: usd,
    rate: parseRate(['1.1', '0.0067', '3.25'][i] ?? '1'),
    asOf: start,
  }));

type Op =
  | { t: 'spend' | 'paycheck'; account: Account; amount: number; bill: boolean }
  | { t: 'transfer'; from: Account; to: Account; amount: number }
  | { t: 'reverse'; pick: number };

function opArb(accounts: readonly Account[]): fc.Arbitrary<Op> {
  const account = fc.constantFrom(...accounts);
  const amount = fc.integer({ min: 1, max: 1e8 });
  return fc.oneof(
    fc.record({
      t: fc.constantFrom('spend' as const, 'paycheck' as const),
      account,
      amount,
      bill: fc.boolean(),
    }),
    fc.record({
      t: fc.constant('transfer' as const),
      from: account,
      to: account,
      amount,
    }),
    fc.record({ t: fc.constant('reverse' as const), pick: fc.nat() }),
  );
}

// Entries that pay a bill are linked to it, as the app does.
function build(ops: readonly (readonly [Op, LocalDate])[]): {
  ledger: Transaction[];
  linked: Transaction[];
} {
  const ledger: Transaction[] = [];
  const linked: Transaction[] = [];
  ops.forEach(([op, occurredOn], i) => {
    const meta = {
      id: transactionId(`t${String(i).padStart(4, '0')}`),
      occurredOn,
      createdAt: `2026-05-01T00:00:${String(i % 60).padStart(2, '0')}.${String(i).padStart(3, '0')}Z`,
    };
    switch (op.t) {
      case 'spend':
      case 'paycheck': {
        const make = op.t === 'spend' ? expense : income;
        const entry = make(chart, meta, {
          accountId: op.account.id,
          amount: money(op.amount, op.account.currency),
          categoryId: op.t === 'spend' ? food : salary,
        });
        ledger.push(entry);
        if (op.t === 'spend' && op.bill) linked.push(entry);
        break;
      }
      case 'transfer':
        if (op.from.id === op.to.id) return;
        ledger.push(
          transfer(chart, meta, {
            fromId: op.from.id,
            toId: op.to.id,
            sent: money(op.amount, op.from.currency),
            received: money(
              op.from.currency === op.to.currency
                ? op.amount
                : Math.max(1, Math.trunc(op.amount / 3)),
              op.to.currency,
            ),
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
  return { ledger, linked };
}

function viewArb(accounts: readonly Account[]): fc.Arbitrary<LedgerView> {
  return fc
    .record({
      ops: fc.array(fc.tuple(opArb(accounts), fc.constantFrom(...days)), {
        maxLength: 40,
      }),
      paydayDay: fc.integer({ min: 1, max: 31 }),
      billDay: fc.integer({ min: 1, max: 31 }),
      billAmount: fc.integer({ min: 1, max: 1e8 }),
      startedOn: fc.constantFrom(...days),
    })
    .map(({ ops, paydayDay, billDay, billAmount, startedOn }): LedgerView => {
      const { ledger, linked } = build(ops);
      return {
        chart,
        ledger,
        paycheckCategories: new Set([salary]),
        settings: {
          defaultCurrency: usd,
          startedOn,
          paydayRule: 'fixed',
          paydayDay,
          paydayOverride: null,
        },
        bills: [
          {
            id: billId('rent'),
            amount: money(billAmount, 'USD'),
            dueDay: billDay,
            payments: linked.map((entry, at) => ({
              dueOn: addDays(start, at),
              paidOn: entry.occurredOn,
              transactionId: entry.id,
            })),
          },
        ],
        rates,
      };
    });
}

const todayArb = fc.constantFrom(...days);

describe('cycle allocation properties', () => {
  it('adds up to its start exactly, in whole minor units, in any currency mix', () => {
    fc.assert(
      fc.property(viewArb(allAccounts), todayArb, (view, today) => {
        const a = cycleAllocation(view, today);
        const parts = [a.paidBills, a.savings, a.spent, a.reserved, a.free];
        for (const part of [a.start, ...parts]) {
          expect(Number.isSafeInteger(part.amountMinor)).toBe(true);
          expect(part.currency).toBe(usd);
        }
        expect(a.start.amountMinor).toBe(
          parts.reduce((sum, part) => sum + part.amountMinor, 0),
        );
      }),
    );
  });

  it('agrees with the daily figures in one currency', () => {
    fc.assert(
      fc.property(viewArb(usdAccounts), todayArb, (view, today) => {
        const a = cycleAllocation(view, today);
        const figures = dailyFiguresOn(view, today);
        expect(a.free).toEqual(figures.available);
        expect(a.reserved).toEqual(figures.reserved);
        expect(a.paidBills.amountMinor + a.spent.amountMinor).toBe(
          figures.cycleSpent.amountMinor,
        );
      }),
    );
  });

  it('does not depend on the order entries arrive in', () => {
    fc.assert(
      fc.property(viewArb(allAccounts), todayArb, (view, today) => {
        const shuffled = { ...view, ledger: [...view.ledger].reverse() };
        expect(cycleAllocation(shuffled, today)).toEqual(
          cycleAllocation(view, today),
        );
      }),
    );
  });

  it('keeps the same start when an expense is back-dated into the cycle', () => {
    fc.assert(
      fc.property(
        viewArb(usdAccounts),
        todayArb,
        fc.integer({ min: 1, max: 1e6 }),
        (view, today, amount) => {
          const before = cycleAllocation(view, today);
          const entry = expense(
            chart,
            {
              id: transactionId('extra'),
              occurredOn: today,
              createdAt: '2026-06-01T00:00:00.000Z',
            },
            {
              accountId: accountId('card-USD'),
              amount: money(amount, 'USD'),
              categoryId: food,
            },
          );
          const after = cycleAllocation(
            { ...view, ledger: [...view.ledger, entry] },
            today,
          );
          // The first USD account is on budget, so the spending moves
          // free money to spent and nothing else.
          expect(after.start).toEqual(before.start);
          expect(after.spent.amountMinor).toBe(
            before.spent.amountMinor + amount,
          );
          expect(after.free.amountMinor).toBe(before.free.amountMinor - amount);
        },
      ),
    );
  });
});
