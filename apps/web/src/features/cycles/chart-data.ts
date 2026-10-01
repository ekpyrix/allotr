import {
  formatMoney,
  type CategoryColour,
  type CycleDayView,
  type CycleDetailView,
  type CycleSummaryView,
  type Money,
} from '@allotr/shared';
import { formatDay, formatLongDay } from '@/features/today/format';
import type { CategoryStyle } from '@/lib/category-style';
import { t } from '@/messages/t';
import { categoryName, formatRange } from './format.ts';

// What the cycle's charts and their tables show, from server figures as
// they are. Nothing here adds money up: rows are looked up, compared and
// formatted.

/** A day's spending passed that day's allowance (a comparison, not a sum). */
export function isOver(day: CycleDayView): boolean {
  return (
    day.spent !== null &&
    day.allowance !== null &&
    day.spent.amountMinor > day.allowance.amountMinor
  );
}

export type CategoryBar = Readonly<{
  key: string;
  name: string;
  amount: Money;
  /** The category's colour; null for "Other", which has no category. */
  colour: CategoryColour | null;
}>;

/** The ranked categories, then "Other" as the server summed it. */
export function categoryBars(
  top: CycleDetailView['spendingTop'],
  names: ReadonlyMap<string, string>,
  styles: ReadonlyMap<string, CategoryStyle> = new Map(),
): CategoryBar[] {
  return [
    ...top.top.map(({ categoryId, amount }) => ({
      key: categoryId ?? '',
      name: categoryName(names, categoryId),
      amount,
      colour:
        categoryId === null ? null : (styles.get(categoryId)?.colour ?? null),
    })),
    ...(top.other === null
      ? []
      : [
          {
            key: 'other',
            name: t('charts.other', { count: top.other.count }),
            amount: top.other.amount,
            colour: null,
          },
        ]),
  ];
}

const shown = (amount: Money | null, locale: string) =>
  amount === null ? t('charts.none') : formatMoney(amount, locale);

type Row = readonly [key: string, head: string, ...cells: string[]];

export function spendingRows(
  days: readonly CycleDayView[],
  locale: string,
): Row[] {
  return days.map((day) => [
    day.date,
    formatLongDay(day.date, locale),
    shown(day.cumulativeSpent, locale),
    formatMoney(day.pace, locale),
  ]);
}

/** Days up to today; later days have no spending or allowance yet. */
export function dailyRows(
  days: readonly CycleDayView[],
  locale: string,
): Row[] {
  return days
    .filter((day) => day.spent !== null)
    .map((day) => [
      day.date,
      formatLongDay(day.date, locale),
      shown(day.spent, locale),
      shown(day.allowance, locale),
      isOver(day) ? t('charts.overShort') : '',
    ]);
}

export function categoryRows(
  bars: readonly CategoryBar[],
  locale: string,
): Row[] {
  return bars.map((bar) => [
    bar.key,
    bar.name,
    formatMoney(bar.amount, locale),
  ]);
}

/** The last day with figures: today in the open cycle, else its last day. */
export function lastRow(
  days: readonly CycleDayView[],
): CycleDayView | undefined {
  return days.filter((day) => day.cumulativeSpent !== null).at(-1);
}

/** A cycle on the savings charts. */
export type SavingsCycle = Readonly<{
  openedOn: string;
  /** The cycle's dates, for the tooltip and the table. */
  label: string;
  /** Its first day, for the axis. */
  short: string;
  /** The off-budget total at the end of the cycle. */
  total: Money;
  /** How much that total moved over the cycle. */
  change: Money;
}>;

/** How many cycles the savings charts show. */
export const SAVINGS_CYCLES = 12;

/** The newest cycles, oldest first, as the server summed them. */
export function savingsCycles(
  cycles: readonly CycleSummaryView[],
  locale: string,
): SavingsCycle[] {
  return cycles
    .slice(0, SAVINGS_CYCLES)
    .reverse()
    .map((cycle) => ({
      openedOn: cycle.openedOn,
      label:
        cycle.closedOn === null
          ? t('savings.thisCycle')
          : formatRange(cycle.openedOn, cycle.lastDay, locale),
      short: formatDay(cycle.openedOn, locale),
      total: cycle.offBudgetClosing,
      change: cycle.savingsNetChange,
    }));
}

export function savingsRows(
  cycles: readonly SavingsCycle[],
  locale: string,
): Row[] {
  return cycles.map((cycle) => [
    cycle.openedOn,
    cycle.label,
    formatMoney(cycle.total, locale),
    formatMoney(cycle.change, locale, { signDisplay: 'exceptZero' }),
  ]);
}
