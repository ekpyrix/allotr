import { localDate, money, type LocalDate, type Money } from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  accountBalances,
  balanceOf,
  budgetGroupBalances,
  type GroupBalances,
} from './balances.ts';
import {
  budgetSwitch,
  expense,
  income,
  opening,
  transfer,
  writeOff,
} from './build.ts';
import { accountIn } from './chart.ts';
import { LedgerError } from './errors.ts';
import { reverse } from './reverse.ts';
import { food, salary, testChart, testCurrencies } from './testing.ts';
import {
  transactionId,
  type Account,
  type AccountId,
  type EntryMeta,
  type Transaction,
} from './types.ts';

// Invariants 1–4 and 8 of docs/domain.md over random ledgers, in 0-, 2-
// and 3-digit currencies. fast-check prints the seed of any failure.

const chart = testChart();
const userAccounts = [...chart.values()].filter((a) => a.systemRole === null);
const days = Array.from({ length: 31 }, (_, i) =>
  localDate(`2026-03-${String(i + 1).padStart(2, '0')}`),
);

const accountArb = fc.constantFrom(...userAccounts);
const dayArb = fc.constantFrom(...days);
const amountArb = fc.integer({ min: 1, max: 1e9 });

type Op =
  | {
      t: 'expense' | 'income';
      account: Account;
      amount: number;
      foreign: Money | null;
    }
  | {
      t: 'transfer';
      from: Account;
      to: Account;
      sent: number;
      received: number;
    }
  | { t: 'opening'; account: Account; amount: number }
  | { t: 'writeOff'; account: Account }
  | { t: 'switch'; account: Account; group: 'on' | 'off' }
  | { t: 'reverse'; pick: number };

const foreignArb = fc.option(
  fc
    .tuple(fc.constantFrom(...testCurrencies), amountArb)
    .map(([currency, amount]) => money(amount, currency)),
  { nil: null },
);

const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.record({
    t: fc.constantFrom('expense' as const, 'income' as const),
    account: accountArb,
    amount: amountArb,
    foreign: foreignArb,
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
    amount: fc.integer({ min: -1e9, max: 1e9 }).filter((n) => n !== 0),
  }),
  fc.record({ t: fc.constant('writeOff' as const), account: accountArb }),
  fc.record({
    t: fc.constant('switch' as const),
    account: accountArb,
    group: fc.constantFrom('on' as const, 'off' as const),
  }),
  fc.record({ t: fc.constant('reverse' as const), pick: fc.nat() }),
);

// Refusals that random input is expected to hit; anything else fails.
const expectedRefusals = new Set([
  'ledger.already_reversed',
  'ledger.reversal_of_reversal',
  'ledger.budget_group_unchanged',
  'ledger.same_account',
  'ledger.zero_amount',
]);

function build(
  op: Op,
  ledger: readonly Transaction[],
  meta: EntryMeta,
): Transaction | null {
  try {
    switch (op.t) {
      case 'expense':
      case 'income':
        return (op.t === 'expense' ? expense : income)(chart, meta, {
          accountId: op.account.id,
          amount: money(op.amount, op.account.currency),
          categoryId: op.t === 'expense' ? food : salary,
          ...(op.foreign === null || op.foreign.currency === op.account.currency
            ? {}
            : { foreignAmount: op.foreign }),
        });
      case 'transfer':
        return transfer(chart, meta, {
          fromId: op.from.id,
          toId: op.to.id,
          sent: money(op.sent, op.from.currency),
          received: money(
            op.from.currency === op.to.currency ? op.sent : op.received,
            op.to.currency,
          ),
        });
      case 'opening':
        return opening(chart, meta, {
          accountId: op.account.id,
          amount: money(op.amount, op.account.currency),
        });
      case 'writeOff':
        return writeOff(chart, meta, {
          accountId: op.account.id,
          balance: balanceOf(chart, ledger, op.account.id),
        });
      case 'switch':
        return budgetSwitch(chart, ledger, meta, {
          accountId: op.account.id,
          budgetGroup: op.group,
        });
      case 'reverse': {
        const target = ledger[op.pick % Math.max(1, ledger.length)];
        if (target === undefined) return null;
        return reverse(chart, ledger, target.id, meta);
      }
    }
  } catch (error) {
    if (error instanceof LedgerError && expectedRefusals.has(error.code))
      return null;
    throw error;
  }
}

function replay(ops: readonly (readonly [Op, LocalDate])[]): Transaction[] {
  const ledger: Transaction[] = [];
  ops.forEach(([op, occurredOn], i) => {
    const meta: EntryMeta = {
      id: transactionId(`t${String(i).padStart(4, '0')}`),
      occurredOn,
      createdAt: `2026-04-01T00:00:${String(i % 60).padStart(2, '0')}.${String(i).padStart(3, '0')}Z`,
    };
    const next = build(op, ledger, meta);
    if (next !== null) ledger.push(next);
  });
  return ledger;
}

const ledgerArb = fc
  .array(fc.tuple(opArb, dayArb), { maxLength: 40 })
  .map(replay);

// Balances with zero entries dropped, as a plain comparable object.
function nonZero(balances: ReadonlyMap<AccountId, Money>) {
  return Object.fromEntries(
    [...balances]
      .filter(([, m]) => m.amountMinor !== 0)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

function groupsNonZero(groups: GroupBalances) {
  const plain = (m: GroupBalances['on']) =>
    Object.fromEntries([...m].filter(([, v]) => v.amountMinor !== 0));
  return { on: plain(groups.on), off: plain(groups.off) };
}

const checkpoints: (LocalDate | undefined)[] = [
  localDate('2026-02-28'),
  ...days,
  undefined,
];

describe('ledger invariants', () => {
  it('every transaction balances per currency in its accounts’ currencies', () => {
    fc.assert(
      fc.property(ledgerArb, (ledger) => {
        for (const t of ledger) {
          const sums = new Map<string, number>();
          for (const { accountId, amount } of t.postings) {
            expect(amount.currency).toBe(accountIn(chart, accountId).currency);
            expect(Number.isSafeInteger(amount.amountMinor)).toBe(true);
            expect(amount.amountMinor).not.toBe(0);
            sums.set(
              amount.currency,
              (sums.get(amount.currency) ?? 0) + amount.amountMinor,
            );
          }
          for (const sum of sums.values()) expect(sum).toBe(0);
          if (t.postings.length < 2) {
            expect(
              t.kind === 'budget_switch' ||
                ledger.find((o) => o.id === t.reversesId)?.kind ===
                  'budget_switch',
            ).toBe(true);
          }
        }
      }),
    );
  });

  it('all balances net to zero per currency on every day', () => {
    fc.assert(
      fc.property(ledgerArb, (ledger) => {
        for (const asOf of checkpoints) {
          const totals = new Map<string, number>();
          for (const m of accountBalances(ledger, asOf).values()) {
            totals.set(
              m.currency,
              (totals.get(m.currency) ?? 0) + m.amountMinor,
            );
          }
          for (const total of totals.values()) expect(total).toBe(0);
        }
      }),
    );
  });

  it('never changes a committed transaction', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(opArb, dayArb), { maxLength: 40 }),
        (ops) => {
          const full = replay(ops);
          const snapshot = JSON.stringify(full);
          for (const t of full) {
            expect(Object.isFrozen(t)).toBe(true);
            expect(Object.isFrozen(t.postings)).toBe(true);
          }
          // Replaying a prefix gives the same transactions as before.
          const prefix = replay(ops.slice(0, Math.floor(ops.length / 2)));
          expect(JSON.stringify(full.slice(0, prefix.length))).toBe(
            JSON.stringify(prefix),
          );
          expect(JSON.stringify(full)).toBe(snapshot);
        },
      ),
    );
  });

  it('gives the same figures whatever order the ledger arrives in', () => {
    fc.assert(
      fc.property(
        ledgerArb.chain((ledger) =>
          fc.tuple(
            fc.constant(ledger),
            fc.shuffledSubarray(ledger, {
              minLength: ledger.length,
            }),
          ),
        ),
        ([ledger, shuffled]) => {
          for (const asOf of checkpoints) {
            expect(nonZero(accountBalances(shuffled, asOf))).toEqual(
              nonZero(accountBalances(ledger, asOf)),
            );
            expect(
              groupsNonZero(budgetGroupBalances(chart, shuffled, asOf)),
            ).toEqual(groupsNonZero(budgetGroupBalances(chart, ledger, asOf)));
          }
        },
      ),
    );
  });

  it('a transaction followed by its reversal leaves every balance unchanged', () => {
    fc.assert(
      fc.property(ledgerArb, opArb, dayArb, (ledger, op, day) => {
        const extra = build(op, ledger, {
          id: transactionId('extra'),
          occurredOn: day,
          createdAt: '2026-05-01T00:00:00.000Z',
        });
        fc.pre(extra !== null && extra.kind !== 'reversal');
        const undo = reverse(chart, [...ledger, extra], extra.id, {
          id: transactionId('extra-undo'),
          createdAt: '2026-05-01T00:00:01.000Z',
        });
        const after = [...ledger, extra, undo];
        for (const asOf of checkpoints) {
          expect(nonZero(accountBalances(after, asOf))).toEqual(
            nonZero(accountBalances(ledger, asOf)),
          );
          expect(
            groupsNonZero(budgetGroupBalances(chart, after, asOf)),
          ).toEqual(groupsNonZero(budgetGroupBalances(chart, ledger, asOf)));
        }
      }),
    );
  });
});
