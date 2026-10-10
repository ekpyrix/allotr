import type { BudgetView, CycleSummaryView, LocalDate } from '@allotr/shared';
import type { ColumnDatum } from '@/charts/columns';
import { formatDay } from '@/features/today/format';
import { spentShare } from '@/features/budget/share';
import { t } from '@/messages/t';
import { formatRate, fractionsOf } from './cycles-model.ts';

// What the plan tab shows: budgets against what was spent, the savings rate
// per cycle and the span of the net worth chart. All amounts are the
// server's; fractions only size bars.

export type BudgetRow = Readonly<{
  key: string;
  name: string;
  budget: BudgetView;
  /** The bar's fill, 0..1. */
  fraction: number;
  over: boolean;
}>;

/** One row per budget, in the order the server sent. */
export function budgetRows(budgets: readonly BudgetView[]): BudgetRow[] {
  return budgets.map((budget) => ({
    key: budget.id,
    name: budget.name,
    budget,
    fraction: spentShare(budget.spent, budget.left) / 100,
    over: budget.overflow.amountMinor > 0,
  }));
}

function rateText(cycle: CycleSummaryView): string {
  return cycle.savingsRate === null
    ? t('reportsPlan.rate.none')
    : formatRate(cycle.savingsRate);
}

/** One column per cycle: the server's savings rate. A loss has no bar. */
export function rateColumns(
  cycles: readonly CycleSummaryView[],
  locale: string,
): ColumnDatum[] {
  const fractions = fractionsOf(cycles.map((c) => c.savingsRate ?? 0));
  return cycles.map((cycle, i) => ({
    id: cycle.openedOn,
    fraction: fractions[i] ?? 0,
    valueLabel: rateText(cycle),
    xLabel: formatDay(cycle.openedOn, locale),
    color: 'series-3',
  }));
}

export const MIN_WORTH_DAYS = 7;
export const MAX_WORTH_DAYS = 731;

const DAY_MS = 86_400_000;

/**
 * Days the net worth chart covers: from the period's first day through
 * today, kept within what the API allows. Calendar days only.
 */
export function worthDays(
  from: LocalDate | undefined,
  today: LocalDate,
): number {
  if (from === undefined) return MAX_WORTH_DAYS;
  const span =
    Math.round(
      (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
        DAY_MS,
    ) + 1;
  if (!Number.isFinite(span)) return MIN_WORTH_DAYS;
  return Math.min(MAX_WORTH_DAYS, Math.max(MIN_WORTH_DAYS, span));
}
