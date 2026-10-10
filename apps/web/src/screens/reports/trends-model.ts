import {
  money,
  type CategorySeriesView,
  type CategoryView,
  type Money,
} from '@allotr/shared';
import type { SeriesColor } from '@/components/bars';
import type { ChartSeries, ChartTable, ChartTick } from '@/charts/chart';
import type { ColumnDatum } from '@/charts/columns';
import { niceTicks } from '@/charts/math';
import { formatDay } from '@/features/today/format';
import { categoryStyles } from '@/lib/category-style';
import { formatMoney, formatMoneyShort } from '@/lib/format-money';
import { t } from '@/messages/t';
import { fractionOf } from './summary-model.ts';

// The trends tab's view model: category spending across consecutive
// periods, as the server summed them. Nothing is added up here. Amounts
// are looked up, compared and formatted; positions are fractions or axis
// ticks, never amounts anyone is told they have.

/** How many periods the trends look back, the selected one included. */
export const TREND_PERIODS = 6;

/** The categories drawn as lines; the rest stay in the table. */
export const TREND_LINES = 5;

const NO_CATEGORY_COLOUR: SeriesColor = 'series-8';

function currencyOf(series: CategorySeriesView) {
  return series.totals[0]?.currency;
}

function nameOf(id: string | null, names: ReadonlyMap<string, string>) {
  return (
    (id === null ? undefined : names.get(id)) ??
    t('reportsSummary.categories.none')
  );
}

/** A period's first day as the axis label. */
export function periodLabels(
  series: CategorySeriesView,
  locale: string,
): string[] {
  return series.periods.map((p) => formatDay(p.from, locale));
}

/** At most `max` tick positions across `count` points, first and last kept. */
export function tickIndexes(count: number, max = 6): number[] {
  if (count <= 0) return [];
  if (count <= max) return Array.from({ length: count }, (_, i) => i);
  const step = (count - 1) / (max - 1);
  return [
    ...new Set(Array.from({ length: max }, (_, i) => Math.round(i * step))),
  ];
}

export interface TrendLines {
  series: ChartSeries[];
  yTicks: ChartTick[];
  xTicks: ChartTick[];
  table: ChartTable;
}

/** The largest categories as lines, one point per period. */
export function trendLines(
  series: CategorySeriesView,
  categories: readonly CategoryView[],
  locale: string,
  limit = TREND_LINES,
): TrendLines {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const styles = categoryStyles(categories);
  const labels = periodLabels(series, locale);
  const shown = series.groups.slice(0, limit);
  const lines = shown.map((group): ChartSeries => {
    const id = group.categoryId ?? 'none';
    return {
      id,
      label: nameOf(group.categoryId, names),
      color:
        (group.categoryId === null
          ? undefined
          : styles.get(group.categoryId)?.colour) ?? NO_CATEGORY_COLOUR,
      points: group.points.map((p, x) => ({ x, y: p.amountMinor })),
    };
  });
  const high = lines
    .flatMap((l) => l.points.map((p) => p.y))
    .reduce((a, b) => Math.max(a, b), 0);
  const currency = currencyOf(series);
  return {
    series: lines,
    // Axis positions, rounded; not amounts anyone is told they have.
    yTicks:
      currency === undefined
        ? []
        : niceTicks(0, high, 3).map((value) => ({
            value,
            label: formatMoneyShort(money(value, currency), locale),
          })),
    xTicks: tickIndexes(labels.length).map((value) => ({
      value,
      label: labels[value] ?? '',
    })),
    table: {
      caption: t('reportsSummary.trends.linesCaption'),
      headers: [
        t('reportsSummary.trends.period'),
        ...shown.map((g) => nameOf(g.categoryId, names)),
      ],
      rows: series.periods.map((_, i) => [
        labels[i] ?? '',
        ...shown.map((g) => {
          const point = g.points[i];
          return point === undefined
            ? ''
            : formatMoney(point, 'symbol', locale);
        }),
      ]),
    },
  };
}

export type Movement = 'up' | 'down' | 'same';

export interface VersusRow {
  key: string;
  name: string;
  colour: SeriesColor;
  /** The selected period's spending. */
  current: Money;
  /** The period before; null when there is none. */
  previous: Money | null;
  movement: Movement | null;
}

/**
 * The selected period against the one before it, per category. The server
 * sends no average across periods, so the comparison is with the last one.
 */
export function versusRows(
  series: CategorySeriesView,
  categories: readonly CategoryView[],
): VersusRow[] {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const styles = categoryStyles(categories);
  const last = series.periods.length - 1;
  return series.groups.flatMap((group): VersusRow[] => {
    const current = group.points[last];
    if (current === undefined) return [];
    const previous = last > 0 ? (group.points[last - 1] ?? null) : null;
    if (current.amountMinor === 0 && (previous?.amountMinor ?? 0) === 0)
      return [];
    return [
      {
        key: group.categoryId ?? 'none',
        name: nameOf(group.categoryId, names),
        colour:
          (group.categoryId === null
            ? undefined
            : styles.get(group.categoryId)?.colour) ?? NO_CATEGORY_COLOUR,
        current,
        previous,
        movement:
          previous === null
            ? null
            : current.amountMinor > previous.amountMinor
              ? 'up'
              : current.amountMinor < previous.amountMinor
                ? 'down'
                : 'same',
      },
    ];
  });
}

export interface TotalsChart {
  columns: ColumnDatum[];
  rows: string[][];
}

/** Total spent per period; the selected (last) period in a second colour. */
export function totalsColumns(
  series: CategorySeriesView,
  locale: string,
): TotalsChart {
  const labels = periodLabels(series, locale);
  const peak = series.totals.reduce(
    (max, m) => Math.max(max, m.amountMinor),
    0,
  );
  const last = series.totals.length - 1;
  return {
    columns: series.totals.map((total, i) => ({
      id: series.periods[i]?.from ?? String(i),
      fraction: fractionOf(total.amountMinor, peak),
      valueLabel: formatMoneyShort(total, locale),
      xLabel: labels[i] ?? '',
      color: i === last ? ('series-1' as const) : ('series-3' as const),
    })),
    rows: series.totals.map((total, i) => [
      labels[i] ?? '',
      formatMoney(total, 'symbol', locale),
    ]),
  };
}

/** Whether any period in the series had spending. */
export function hasSpending(series: CategorySeriesView): boolean {
  return series.totals.some((m) => m.amountMinor > 0);
}
