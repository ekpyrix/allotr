import {
  money,
  type CurrencyCode,
  type LocalDate,
  type Money,
} from '@allotr/shared';
import { cycleOn, cyclesOf } from './cycles.ts';
import {
  add,
  availableSums,
  billPaymentEntries,
  onBudgetSums,
  spentSums,
  toFigure,
  type Sums,
} from './daily.ts';
import { cycleSnapshot } from './snapshot.ts';
import type { LedgerView } from './types.ts';

// How the open cycle's on-budget money divides (docs/domain.md "Cycle
// allocation", docs/ui.md §8). Sums stay per currency; each part is
// converted once to the default currency (ADR 0010), and `start` is the
// sum of the converted parts so the five always add up exactly.

export type CycleAllocation = Readonly<{
  /**
   * What the open cycle had to work with: on-budget money at the end of the
   * day before it opened (accounts opened during it counted from the start),
   * plus the income recorded since. Always exactly the sum of the five parts.
   */
  start: Money;
  /** Linked bill payments this cycle, less their undos. */
  paidBills: Money;
  /**
   * Left the budget without being spent or paying a bill: transfers to
   * savings, accounts moved to a savings pool, money lent. Negative when
   * more came back than went. What is left of `start` after the other four.
   */
  savings: Money;
  /** Spending this cycle other than linked bill payments, less undos. */
  spent: Money;
  /** Unpaid bills reserved, and what the user owes people, now. */
  reserved: Money;
  /** On-budget money less `reserved`, now: the `available` figure. */
  free: Money;
  /** Currencies without a rate to the default one, left out. */
  missingRates: readonly CurrencyCode[];
}>;

/** The allocation of the cycle holding `today`. */
export function cycleAllocation(
  view: LedgerView,
  today: LocalDate,
): CycleAllocation {
  const cycles = cyclesOf(view, today);
  const cycle = cycleOn(cycles, today);

  const startNative: Sums = new Map();
  const snapshot = cycleSnapshot(view, cycle, today, cycles);
  for (const [currency, amount] of snapshot.opening.on) {
    add(startNative, currency, BigInt(amount.amountMinor));
  }
  for (const { amount } of snapshot.income) {
    add(startNative, amount.currency, BigInt(amount.amountMinor));
  }

  const onBudget = onBudgetSums(view, today);
  const free = availableSums(view, cycles, today);
  const reserved: Sums = new Map(onBudget);
  for (const [currency, amount] of free) add(reserved, currency, -amount);

  const { spent: all, kept: spent } = spentSums(
    view,
    cycle.openedOn,
    today,
    billPaymentEntries(view),
  );
  const paid: Sums = new Map(all);
  for (const [currency, amount] of spent) add(paid, currency, -amount);

  // Money that left the budget some other way is what the other parts do
  // not explain, so the parts add up per currency by construction.
  const savings: Sums = new Map(startNative);
  for (const parts of [paid, spent, reserved, free]) {
    for (const [currency, amount] of parts) add(savings, currency, -amount);
  }

  const figures = {
    paidBills: toFigure(view, paid, today),
    savings: toFigure(view, savings, today),
    spent: toFigure(view, spent, today),
    reserved: toFigure(view, reserved, today),
    free: toFigure(view, free, today),
  };
  const total = Object.values(figures).reduce(
    (sum, figure) => sum + figure.amount.amountMinor,
    0,
  );
  return {
    start: money(total, view.settings.defaultCurrency),
    paidBills: figures.paidBills.amount,
    savings: figures.savings.amount,
    spent: figures.spent.amount,
    reserved: figures.reserved.amount,
    free: figures.free.amount,
    missingRates: [
      ...new Set(Object.values(figures).flatMap((f) => f.missingRates)),
    ].sort(),
  };
}
