import {
  money,
  type CurrencyCode,
  type LocalDate,
  type Money,
} from '@allotr/shared';
import {
  budgetPeriodOn,
  heldBy,
  leftOf,
  type Budget,
  type BudgetPeriod,
  type DailyMode,
} from './budgets.ts';
import { budgetFold, dailyFiguresOn } from './daily.ts';
import type { LedgerView } from './types.ts';

// What the Budget view reads (ADR 0021): every budget's figures for the
// current period, and what is free once set-aside budgets hold their share.

/** One budget's figures for a period, in the default currency. */
export type BudgetLineStatus = Readonly<{
  budget: Budget;
  /** Planned for the period. */
  planned: Money;
  /** Left over from earlier periods, when the budget carries. */
  carriedIn: Money;
  spent: Money;
  /** Planned plus carried in, less spent. Negative when overspent. */
  left: Money;
  /** What a set-aside budget still holds out of free money; zero otherwise. */
  held: Money;
}>;

export type BudgetStatus = Readonly<{
  today: LocalDate;
  period: BudgetPeriod;
  /** Days left in the cycle, as for the daily number. */
  daysLeft: number;
  lines: readonly BudgetLineStatus[];
  /** Counted accounts less unpaid reserved bills. */
  available: Money;
  /** Set-aside budgets' holds, Buffer included. */
  held: Money;
  /** `available` less `held`. */
  free: Money;
  /** What the daily budgets have left in total. */
  dailyLeft: Money;
  /** Spending in the period that no budget counts. */
  unbudgeted: Money;
  dailyMode: DailyMode;
  /** The daily number: what `dailyMode` divides, over the days left. */
  dailyNumber: Money;
  missingRates: readonly CurrencyCode[];
}>;

/** Budget figures as of `today`, from the same ledger the daily number reads. */
export function budgetStatus(view: LedgerView, today: LocalDate): BudgetStatus {
  const currency = view.settings.defaultCurrency;
  const fold = budgetFold(view, today);
  const daily = dailyFiguresOn(view, today);
  const m = (amount: bigint) => money(Number(amount), currency);
  const lines = (fold?.lines ?? []).map((line): BudgetLineStatus => ({
    budget: line.budget,
    planned: m(line.amount),
    carriedIn: m(line.carriedIn),
    spent: m(line.spent),
    left: m(leftOf(line)),
    held: m(heldBy(line)),
  }));
  const dailyLeft = (fold?.lines ?? [])
    .filter((l) => l.budget.mode === 'daily')
    .reduce((sum, l) => sum + leftOf(l), 0n);
  return {
    today,
    period: fold?.period ?? budgetPeriodOn(view, today, today),
    daysLeft: daily.daysLeft,
    lines,
    available: daily.available,
    held: daily.held,
    free: daily.free,
    dailyLeft: m(dailyLeft),
    unbudgeted: m(fold?.unbudgeted ?? 0n),
    dailyMode: daily.dailyMode,
    dailyNumber: daily.liveDaily,
    missingRates: daily.missingRates,
  };
}
