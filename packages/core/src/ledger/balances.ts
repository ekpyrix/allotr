import {
  money,
  type CurrencyCode,
  type LocalDate,
  type Money,
} from '@allotr/shared';
import { accountIn, type Chart } from './chart.ts';
import type { AccountId, BudgetGroup, Transaction } from './types.ts';

// Balances are a pure fold over postings (docs/domain.md, invariant 8): the
// same ledger gives the same figures whatever order it arrives in.
// `asOf` includes every transaction dated on or before that day.

function inRange(transaction: Transaction, asOf: LocalDate | undefined) {
  return asOf === undefined || transaction.occurredOn <= asOf;
}

function sumsByKey<K>(
  entries: Iterable<readonly [K, Money]>,
): Map<K, { currency: CurrencyCode; sum: bigint }> {
  const sums = new Map<K, { currency: CurrencyCode; sum: bigint }>();
  for (const [key, amount] of entries) {
    const entry = sums.get(key);
    if (entry === undefined) {
      sums.set(key, {
        currency: amount.currency,
        sum: BigInt(amount.amountMinor),
      });
    } else {
      entry.sum += BigInt(amount.amountMinor);
    }
  }
  return sums;
}

// Balances beyond the safe-integer range fail in `money`, never round.
function toMoney(entry: { currency: CurrencyCode; sum: bigint }): Money {
  return money(Number(entry.sum), entry.currency);
}

/** Every account's balance, in its own currency. */
export function accountBalances(
  ledger: readonly Transaction[],
  asOf?: LocalDate,
): ReadonlyMap<AccountId, Money> {
  const sums = sumsByKey(
    ledger
      .filter((transaction) => inRange(transaction, asOf))
      .flatMap((transaction) =>
        transaction.postings.map(
          (posting) => [posting.accountId, posting.amount] as const,
        ),
      ),
  );
  return new Map([...sums].map(([id, entry]) => [id, toMoney(entry)]));
}

export function balanceOf(
  chart: Chart,
  ledger: readonly Transaction[],
  id: AccountId,
  asOf?: LocalDate,
): Money {
  const account = accountIn(chart, id);
  return accountBalances(ledger, asOf).get(id) ?? money(0, account.currency);
}

// Budget switches that were not reversed, oldest first. Ties on a date go
// by creation time, then ID, so the order never depends on the input.
function activeSwitches(ledger: readonly Transaction[]): Transaction[] {
  const reversed = new Set(
    ledger.flatMap((t) => (t.reversesId === null ? [] : [t.reversesId])),
  );
  return ledger
    .filter((t) => t.budgetSwitch !== null && !reversed.has(t.id))
    .sort(
      (a, b) =>
        a.occurredOn.localeCompare(b.occurredOn) ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    );
}

function groupsOn(
  chart: Chart,
  ledger: readonly Transaction[],
  date: LocalDate | undefined,
): Map<AccountId, BudgetGroup> {
  const groups = new Map<AccountId, BudgetGroup>();
  for (const account of chart.values()) {
    if (account.budgetGroup !== null)
      groups.set(account.id, account.budgetGroup);
  }
  for (const { budgetSwitch, occurredOn } of activeSwitches(ledger)) {
    if (budgetSwitch !== null && (date === undefined || occurredOn <= date)) {
      groups.set(budgetSwitch.accountId, budgetSwitch.budgetGroup);
    }
  }
  return groups;
}

/** The budget group of a user account at the end of a day (FR-L2). */
export function budgetGroupOn(
  chart: Chart,
  ledger: readonly Transaction[],
  id: AccountId,
  date?: LocalDate,
): BudgetGroup | null {
  accountIn(chart, id);
  return groupsOn(chart, ledger, date).get(id) ?? null;
}

export type GroupBalances = Readonly<
  Record<BudgetGroup, ReadonlyMap<CurrencyCode, Money>>
>;

/**
 * On- and off-budget totals per currency, each account counted in the group
 * it belongs to on `asOf`. Conversion to the default currency happens at
 * display time, not here (ADR 0010).
 */
export function budgetGroupBalances(
  chart: Chart,
  ledger: readonly Transaction[],
  asOf?: LocalDate,
): GroupBalances {
  const groups = groupsOn(chart, ledger, asOf);
  const balances = accountBalances(ledger, asOf);
  const totals = (group: BudgetGroup) =>
    new Map(
      [
        ...sumsByKey(
          [...groups]
            .filter(([, g]) => g === group)
            .flatMap(([id]) => {
              const balance = balances.get(id);
              return balance === undefined
                ? []
                : [[balance.currency, balance] as const];
            }),
        ),
      ]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([currency, entry]) => [currency, toMoney(entry)]),
    );
  return { on: totals('on'), off: totals('off') };
}
