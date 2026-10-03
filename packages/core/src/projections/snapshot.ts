import {
  addDays,
  money,
  type CurrencyCode,
  type LocalDate,
  type Money,
} from '@allotr/shared';
import { budgetGroupBalances, type GroupBalances } from '../ledger/balances.ts';
import { groupsOn } from './pools.ts';
import type { AccountId, CategoryId } from '../ledger/types.ts';
import { cyclesOf } from './cycles.ts';
import { availableSums, policiesOf } from './daily.ts';
import type { Settlement } from './policies.ts';
import type { Cycle, LedgerView } from './types.ts';

// A cycle's snapshot (FR-C1) is computed, never stored: a back-dated entry
// into a closed cycle changes it the next time it is read (FR-C6).

export type CategoryTotal = Readonly<{
  categoryId: CategoryId | null;
  amount: Money;
}>;

export type Leftover = Settlement & Readonly<{ leftover: Money }>;

export type CycleSnapshot = Readonly<{
  cycle: Cycle;
  /** The last day it covers: the day before it closed, or today. */
  lastDay: LocalDate;
  /**
   * At the end of the day before it opened, plus accounts opened during
   * it, so an opening balance is never counted as saved.
   */
  opening: GroupBalances;
  /** At the end of `lastDay`. */
  closing: GroupBalances;
  income: readonly CategoryTotal[];
  spending: readonly CategoryTotal[];
  /** Available budget at the end, per currency, and what the policy does with it. */
  leftover: readonly Leftover[];
  savingsNetChange: readonly Money[];
}>;

export function byCategory(
  entries: Iterable<readonly [CategoryId | null, Money]>,
): CategoryTotal[] {
  const sums = new Map<
    string,
    { categoryId: CategoryId | null; currency: CurrencyCode; sum: bigint }
  >();
  for (const [categoryId, amount] of entries) {
    const key = `${categoryId ?? ''}\u0000${amount.currency}`;
    const entry = sums.get(key);
    if (entry === undefined) {
      sums.set(key, {
        categoryId,
        currency: amount.currency,
        sum: BigInt(amount.amountMinor),
      });
    } else {
      entry.sum += BigInt(amount.amountMinor);
    }
  }
  return [...sums]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([, { categoryId, currency, sum }]) =>
      sum === 0n ? [] : [{ categoryId, amount: money(Number(sum), currency) }],
    );
}

export function cycleSnapshot(
  view: LedgerView,
  cycle: Cycle,
  today: LocalDate,
  /** `cyclesOf(view, today)`, when the caller already has it. */
  cycles: readonly Cycle[] = cyclesOf(view, today),
): CycleSnapshot {
  const lastDay = cycle.closedOn === null ? today : addDays(cycle.closedOn, -1);
  const inCycle = view.ledger.filter(
    (t) => t.occurredOn >= cycle.openedOn && t.occurredOn <= lastDay,
  );
  const roleOf = (id: AccountId) => view.chart.get(id)?.systemRole ?? null;
  const legs = (role: 'income' | 'expenses', sign: number) =>
    byCategory(
      inCycle.flatMap((t) =>
        t.postings
          .filter((p) => roleOf(p.accountId) === role)
          .map(
            (p) =>
              [
                p.categoryId,
                money(sign * p.amount.amountMinor, p.amount.currency),
              ] as const,
          ),
      ),
    );

  // An account opened during the cycle brings money that was already
  // there, not income or savings: its opening entry (and any undo of it)
  // counts toward the opening balances.
  const openingDay = addDays(cycle.openedOn, -1);
  const openings = new Set(
    inCycle.filter((t) => t.kind === 'opening').map((t) => t.id),
  );
  const opening = budgetGroupBalances(
    view.chart,
    view.ledger.flatMap((t) => {
      if (t.occurredOn < cycle.openedOn) return [t];
      const opens =
        openings.has(t.id) ||
        (t.reversesId !== null && openings.has(t.reversesId));
      return opens && t.occurredOn <= lastDay
        ? [{ ...t, occurredOn: openingDay }]
        : [];
    }),
    openingDay,
    groupsOn(view, openingDay),
  );
  const closing = budgetGroupBalances(
    view.chart,
    view.ledger,
    lastDay,
    groupsOn(view, lastDay),
  );
  const policies = policiesOf(view);
  const leftover = [...availableSums(view, cycles, lastDay)]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, sum]): Leftover => {
      const amount = money(Number(sum), currency);
      const settled =
        sum < 0n
          ? policies.overspend.atPayday(amount)
          : policies.leftover.atPayday(amount);
      return { leftover: amount, ...settled };
    });
  const currencies = [
    ...new Set([...opening.off.keys(), ...closing.off.keys()]),
  ].sort();
  const savingsNetChange = currencies.map((currency) =>
    money(
      (closing.off.get(currency)?.amountMinor ?? 0) -
        (opening.off.get(currency)?.amountMinor ?? 0),
      currency,
    ),
  );

  return {
    cycle,
    lastDay,
    opening,
    closing,
    income: legs('income', -1),
    spending: legs('expenses', 1),
    leftover,
    savingsNetChange,
  };
}
