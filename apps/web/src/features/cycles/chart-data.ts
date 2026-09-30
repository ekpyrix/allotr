import {
  formatMoney,
  type CycleDayView,
  type CycleDetailView,
  type Money,
} from '@allotr/shared';
import { formatLongDay } from '@/features/today/format';
import { t } from '@/messages/t';
import { categoryName } from './format.ts';

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
}>;

/** The ranked categories, then "Other" as the server summed it. */
export function categoryBars(
  top: CycleDetailView['spendingTop'],
  names: ReadonlyMap<string, string>,
): CategoryBar[] {
  return [
    ...top.top.map(({ categoryId, amount }) => ({
      key: categoryId ?? '',
      name: categoryName(names, categoryId),
      amount,
    })),
    ...(top.other === null
      ? []
      : [
          {
            key: 'other',
            name: t('charts.other', { count: top.other.count }),
            amount: top.other.amount,
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
