import type { NetWorthView } from '@allotr/shared';
import type { ChartTick } from '@/charts/chart';
import type { Point } from '@/charts/math';
import { formatDay } from '@/features/today/format';
import { formatMoneyShort } from '@/lib/format-money';

// Net worth as chart input: positions only, the amounts are the server's.

export type NetWorthChart = Readonly<{
  points: readonly Point[];
  yTicks: readonly ChartTick[];
  xTicks: readonly ChartTick[];
}>;

export function netWorthChart(
  series: NetWorthView['series'],
  locale: string,
): NetWorthChart {
  const points = series.map((p, x) => ({ x, y: p.amount.amountMinor }));
  const first = series[0];
  if (first === undefined) return { points, yTicks: [], xTicks: [] };
  const low = series.reduce((a, p) =>
    p.amount.amountMinor < a.amount.amountMinor ? p : a,
  );
  const high = series.reduce((a, p) =>
    p.amount.amountMinor > a.amount.amountMinor ? p : a,
  );
  const extremes =
    low.amount.amountMinor === high.amount.amountMinor ? [low] : [low, high];
  const yTicks = extremes.map((p) => ({
    value: p.amount.amountMinor,
    label: formatMoneyShort(p.amount, locale),
  }));
  const mid = Math.floor((series.length - 1) / 2);
  const xs = [...new Set([0, mid, series.length - 1])];
  const xTicks = xs.map((value) => ({
    value,
    label: formatDay(series[value]?.date ?? first.date, locale),
  }));
  return { points, yTicks, xTicks };
}
