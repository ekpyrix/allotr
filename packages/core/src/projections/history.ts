import type { CurrencyCode, LocalDate, Money } from '@allotr/shared';
import type {
  CategoryId,
  Transaction,
  TransactionId,
} from '../ledger/types.ts';
import { cyclesOf } from './cycles.ts';
import { totalOn } from './rates.ts';
import { cycleSnapshot, type CategoryTotal } from './snapshot.ts';
import type { Cycle, Figure, LedgerView } from './types.ts';

// Cycle history (FR-W2): each cycle's snapshot in the default currency, at
// the rate of the cycle's last day (ADR 0010), and the entries that
// amended it after it closed (FR-C6). Snapshots are never stored, so
// "amended" is read from when entries were recorded: after the paycheck
// that closed the cycle. Reversals and edits keep the original date, so
// they count; an import stamps one instant on every row, so it never does.

/** An entry dated in a closed cycle, recorded after the cycle closed. */
export type Amendment = Readonly<{
  transactionId: TransactionId;
  occurredOn: LocalDate;
  /** When it was recorded (ISO 8601 UTC). */
  recordedAt: string;
}>;

export type GroupTotals = Readonly<{ on: Money; off: Money }>;

export type CycleReport = Readonly<{
  cycle: Cycle;
  /** The last day it covers: the day before it closed, or today. */
  lastDay: LocalDate;
  /** At the end of the day before it opened, plus accounts opened during it. */
  opening: GroupTotals;
  /** At the end of `lastDay`. */
  closing: GroupTotals;
  income: Money;
  spending: Money;
  /** Largest first; a merged category counts as the one it merged into. */
  incomeByCategory: readonly CategoryTotal[];
  spendingByCategory: readonly CategoryTotal[];
  /** Available budget at the end of `lastDay`. */
  leftover: Money;
  savingsNetChange: Money;
  /** Oldest first; always empty for the open cycle. */
  amendments: readonly Amendment[];
  /** Currencies without a rate on `lastDay`, left out of the figures. */
  missingRates: readonly CurrencyCode[];
}>;

function isPaycheck(view: LedgerView, entry: Transaction): boolean {
  return (
    entry.kind === 'income' &&
    entry.postings.some(
      (p) => p.categoryId !== null && view.paycheckCategories.has(p.categoryId),
    )
  );
}

/**
 * The entries dated in `cycle` that were recorded after it closed: after
 * the first paycheck dated the day it closed was recorded. Undone and
 * edited paychecks count too, so correcting the paycheck later never
 * hides an amendment; a paycheck undone and logged again counts from the
 * first one.
 */
export function amendmentsOf(view: LedgerView, cycle: Cycle): Amendment[] {
  const { openedOn, closedOn } = cycle;
  if (closedOn === null) return [];
  const closedAt = Math.min(
    ...view.ledger
      .filter((t) => t.occurredOn === closedOn && isPaycheck(view, t))
      .map((t) => Date.parse(t.createdAt)),
  );
  if (!Number.isFinite(closedAt)) return [];
  return view.ledger
    .filter(
      (t) =>
        t.occurredOn >= openedOn &&
        t.occurredOn < closedOn &&
        Date.parse(t.createdAt) > closedAt,
    )
    .map((t) => ({
      transactionId: t.id,
      occurredOn: t.occurredOn,
      recordedAt: t.createdAt,
    }))
    .sort(
      (a, b) =>
        Date.parse(a.recordedAt) - Date.parse(b.recordedAt) ||
        a.transactionId.localeCompare(b.transactionId),
    );
}

/** Every cycle up to `today`, oldest first, the open one last. */
export function cycleReports(
  view: LedgerView,
  today: LocalDate,
  /** Merged categories and the category each was merged into. */
  mergedInto: ReadonlyMap<CategoryId, CategoryId> = new Map(),
  /** Only the cycle that opened on this day, when given. */
  openedOn?: LocalDate,
): CycleReport[] {
  const cycles = cyclesOf(view, today);
  const target = view.settings.defaultCurrency;
  const wanted =
    openedOn === undefined
      ? cycles
      : cycles.filter((cycle) => cycle.openedOn === openedOn);
  return wanted.map((cycle) => {
    const snapshot = cycleSnapshot(view, cycle, today, cycles);
    const { lastDay } = snapshot;
    const missing = new Set<CurrencyCode>();
    const figure = (amounts: Iterable<Money>): Money => {
      const result: Figure = totalOn(view.rates, amounts, target, lastDay);
      for (const currency of result.missingRates) missing.add(currency);
      return result.amount;
    };
    const groups = (balances: typeof snapshot.opening): GroupTotals => ({
      on: figure(balances.on.values()),
      off: figure(balances.off.values()),
    });
    const byCategory = (totals: readonly CategoryTotal[]): CategoryTotal[] => {
      const native = new Map<CategoryId | null, Money[]>();
      for (const { categoryId, amount } of totals) {
        const key =
          categoryId === null
            ? null
            : (mergedInto.get(categoryId) ?? categoryId);
        native.set(key, [...(native.get(key) ?? []), amount]);
      }
      return [...native]
        .map(([categoryId, amounts]) => ({
          categoryId,
          amount: figure(amounts),
        }))
        .filter(({ amount }) => amount.amountMinor !== 0)
        .sort(
          (a, b) =>
            b.amount.amountMinor - a.amount.amountMinor ||
            (a.categoryId ?? '').localeCompare(b.categoryId ?? ''),
        );
    };

    return {
      cycle,
      lastDay,
      opening: groups(snapshot.opening),
      closing: groups(snapshot.closing),
      income: figure(snapshot.income.map((total) => total.amount)),
      spending: figure(snapshot.spending.map((total) => total.amount)),
      incomeByCategory: byCategory(snapshot.income),
      spendingByCategory: byCategory(snapshot.spending),
      leftover: figure(snapshot.leftover.map((entry) => entry.leftover)),
      savingsNetChange: figure(snapshot.savingsNetChange),
      amendments: amendmentsOf(view, cycle),
      missingRates: [...missing].sort(),
    };
  });
}
