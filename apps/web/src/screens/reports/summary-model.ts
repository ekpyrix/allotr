import type {
  BudgetView,
  CalendarView,
  CategoryIcon,
  CategorySummaryView,
  CategoryView,
  CycleDayView,
  CycleSummaryView,
  LocalDate,
  Money,
} from '@allotr/shared';
import type { SeriesColor, ShareSegment } from '@/components/bars';
import type { ColumnDatum } from '@/charts/columns';
import { formatLongDay } from '@/features/today/format';
import { formatMoney, formatMoneyShort } from '@/lib/format-money';
import { categoryStyles } from '@/lib/category-style';
import { t } from '@/messages/t';
import type { DateRange } from '../transactions/period.ts';
import type { ReportPeriod } from './reports-search.ts';

// The summary tab's view model. Every amount is a figure the server sent.
// This file only compares whole minor units and turns two of them into a
// 0..1 fraction to place a bar; those fractions are never shown as money.

export interface ReportParams {
  period: 'cycle' | 'month';
  cycle?: LocalDate;
  /** `YYYY-MM`. */
  month?: string;
}

/**
 * The report query for a picked period; `null` when it has no dates (no
 * cycle before this one).
 */
export function reportParams(
  period: ReportPeriod,
  range: DateRange | null,
): ReportParams | null {
  switch (period) {
    case 'cycle':
      return { period: 'cycle' };
    case 'month':
      return { period: 'month' };
    case 'last-cycle':
      return range?.from === undefined
        ? null
        : { period: 'cycle', cycle: range.from };
    case 'last-month':
      return range?.from === undefined
        ? null
        : { period: 'month', month: range.from.slice(0, 7) };
  }
}

/** The cycle a cycle period is, from the list (newest first). */
export function cycleOf(
  period: ReportPeriod,
  cycles: readonly CycleSummaryView[],
): CycleSummaryView | null {
  if (period === 'cycle') return cycles[0] ?? null;
  if (period === 'last-cycle') return cycles[1] ?? null;
  return null;
}

/** The stat tiles' figures; `null` where the server sends none. */
export interface StatFigures {
  spent: Money | null;
  income: Money | null;
  saved: Money | null;
}

/**
 * A cycle carries its own spending, income and savings. A month has only
 * the spending total the category series gives, so income and saved stay
 * empty (an API gap).
 */
export function statFigures(
  cycle: CycleSummaryView | null,
  monthSpent: Money | null,
): StatFigures {
  if (cycle !== null) {
    return {
      spent: cycle.spending,
      income: cycle.income,
      saved: cycle.savingsNetChange,
    };
  }
  return { spent: monthSpent, income: null, saved: null };
}

/** The selected period's total, which is the series' last. */
export function periodTotal(summary: CategorySummaryView): Money | null {
  return summary.series?.totals.at(-1) ?? null;
}

/**
 * Where a part sits against a whole, 0..1, to size a bar. Not money: it is
 * never shown as an amount.
 */
export function fractionOf(part: number, whole: number): number {
  if (!(whole > 0) || !(part > 0)) return 0;
  return Math.min(1, part / whole);
}

/** "34%" or "<1%": a share of spending as text, for a column. */
export function sharePercent(fraction: number): string {
  if (fraction <= 0) return '0%';
  const whole = Math.round(fraction * 100);
  return whole < 1
    ? t('reportsSummary.categories.lessThanOne')
    : `${String(whole)}%`;
}

export type CategoryRole = 'parent' | 'child' | 'last-child' | 'flat';

export interface CategoryRow {
  key: string;
  /** The top-level key a child folds under. */
  group: string;
  role: CategoryRole;
  name: string;
  amount: Money;
  /** Share of all spending, 0..1. */
  fraction: number;
  colour: SeriesColor;
  icon: CategoryIcon | null;
  /** The category's budget for this period; null when none or not comparable. */
  budget: Money | null;
  over: boolean;
}

const NO_CATEGORY_COLOUR: SeriesColor = 'series-8';

/**
 * Budgets are for the current budget period, so they only line up with the
 * current cycle or month, and only when the budget period follows the same
 * rule.
 */
export function budgetsByCategory(
  budgets: readonly BudgetView[],
  period: ReportPeriod,
  rule: 'cycle' | 'month',
): ReadonlyMap<string, Money> {
  const comparable = period === rule;
  if (!comparable) return new Map();
  return new Map(
    budgets.flatMap((b) =>
      b.target.kind === 'category'
        ? [[b.target.categoryId, b.planned] as const]
        : [],
    ),
  );
}

export function categoryRows(
  summary: CategorySummaryView,
  total: Money | null,
  categories: readonly CategoryView[],
  budgets: ReadonlyMap<string, Money>,
): CategoryRow[] {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const styles = categoryStyles(categories);
  const whole = total?.amountMinor ?? 0;
  const nameOf = (id: string | null) =>
    (id === null ? undefined : names.get(id)) ??
    t('reportsSummary.categories.none');
  const look = (id: string | null) => {
    const style = id === null ? undefined : styles.get(id);
    return {
      colour: style?.colour ?? NO_CATEGORY_COLOUR,
      icon: style?.icon ?? null,
    };
  };
  const figures = (id: string | null, amount: Money) => {
    const budget = id === null ? null : (budgets.get(id) ?? null);
    return {
      amount,
      fraction: fractionOf(amount.amountMinor, whole),
      budget,
      over:
        budget !== null &&
        budget.currency === amount.currency &&
        amount.amountMinor > budget.amountMinor,
    };
  };
  return summary.spending.flatMap((group): CategoryRow[] => {
    const key = group.categoryId ?? 'none';
    // A group whose only child is itself has nothing to unfold.
    const children =
      group.children.length === 1 &&
      group.children[0]?.categoryId === group.categoryId
        ? []
        : group.children;
    const top = {
      key,
      group: key,
      name: nameOf(group.categoryId),
      ...look(group.categoryId),
      ...figures(group.categoryId, group.amount),
    };
    if (children.length === 0) return [{ ...top, role: 'flat' }];
    return [
      { ...top, role: 'parent' },
      ...children.map((child, index): CategoryRow => {
        const own = child.categoryId === group.categoryId;
        return {
          key: `${key}/${child.categoryId ?? 'none'}`,
          group: key,
          role: index === children.length - 1 ? 'last-child' : 'child',
          name: own
            ? t('reportsSummary.categories.direct', {
                name: nameOf(child.categoryId),
              })
            : nameOf(child.categoryId),
          ...look(child.categoryId),
          ...figures(own ? null : child.categoryId, child.amount),
          // A child's bar is its part of all spending, like its parent's.
        };
      }),
    ];
  });
}

export function visibleRows(
  rows: readonly CategoryRow[],
  folded: ReadonlySet<string>,
): CategoryRow[] {
  return rows.filter(
    (row) =>
      row.role === 'parent' || row.role === 'flat' || !folded.has(row.group),
  );
}

/** The share bar over the top-level categories. */
export function shareSegments(rows: readonly CategoryRow[]): ShareSegment[] {
  return rows
    .filter((row) => row.role === 'parent' || row.role === 'flat')
    .filter((row) => row.fraction > 0)
    .map((row) => ({
      id: row.key,
      label: row.name,
      fraction: row.fraction,
      color: row.colour,
    }));
}

// Spending per day -------------------------------------------------------

export interface DayFigure {
  date: LocalDate;
  /** Null after today. */
  spent: Money | null;
  /** Passed that day's allowance. */
  over: boolean;
}

/** A cycle's days, each against its own allowance. */
export function cycleDayFigures(days: readonly CycleDayView[]): DayFigure[] {
  return days.map((day) => ({
    date: day.date,
    spent: day.spent,
    over:
      day.spent !== null &&
      day.allowance !== null &&
      day.spent.amountMinor > day.allowance.amountMinor,
  }));
}

/** A month's days; the calendar sends no allowance, so none is marked. */
export function monthDayFigures(calendar: CalendarView): DayFigure[] {
  return calendar.days.map((day) => ({
    date: day.date,
    spent: day.spent,
    over: false,
  }));
}

export interface DayChart {
  columns: ColumnDatum[];
  overCount: number;
  rows: string[][];
}

/** Value labels fit above every column only while there are few. */
const LABEL_ALL_UP_TO = 14;

export function dayChart(
  figures: readonly DayFigure[],
  locale: string,
): DayChart {
  const spentDays = figures.flatMap((f) =>
    f.spent === null ? [] : [{ ...f, spent: f.spent }],
  );
  const peak = spentDays.reduce(
    (max, f) => Math.max(max, f.spent.amountMinor),
    0,
  );
  const labelAll = spentDays.length <= LABEL_ALL_UP_TO;
  return {
    overCount: spentDays.filter((f) => f.over).length,
    columns: spentDays.map((f) => ({
      id: f.date,
      fraction: fractionOf(f.spent.amountMinor, peak),
      valueLabel:
        labelAll || f.over || (peak > 0 && f.spent.amountMinor === peak)
          ? formatMoneyShort(f.spent, locale)
          : '',
      xLabel: String(Number(f.date.slice(8))),
      ...(f.over ? { color: 'negative' as const } : {}),
    })),
    rows: spentDays.map((f) => [
      formatLongDay(f.date, locale),
      formatMoney(f.spent, 'symbol', locale),
      f.over ? t('reportsSummary.days.over') : '',
    ]),
  };
}
