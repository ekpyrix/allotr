import type { CycleSummaryView, Money } from '@allotr/shared';
import type { ColumnDatum } from '@/charts/columns';
import { formatDay } from '@/features/today/format';
import { formatRange } from '@/features/cycles/format';
import { formatMoneyShort } from '@/lib/format-money';
import { t } from '@/messages/t';

// What the cycle charts and the cycle table show. Every amount is a figure
// the server summed for the cycle; the browser only picks, orders, formats
// and sizes bars. Column heights are the one derived number, and they place a
// bar without ever being shown.

/** How many cycles the per-cycle charts show. */
export const CYCLE_COLUMNS = 12;

/** The newest cycles, oldest first, so charts read left to right. */
export function recentCycles(
  cycles: readonly CycleSummaryView[],
  count = CYCLE_COLUMNS,
): CycleSummaryView[] {
  return cycles.slice(0, count).reverse();
}

/**
 * A column's height as a share of the tallest, 0..1. Values at or below
 * zero have no height; with nothing above zero every height is 0.
 */
export function fractionsOf(values: readonly number[]): number[] {
  const max = values.reduce((a, v) => (v > a ? v : a), 0);
  return values.map((v) => (max <= 0 || v <= 0 ? 0 : v / max));
}

/**
 * A rate in hundredths of a percent as text ("15.5%", "-5%"). Integer text
 * only, so no float reaches the screen; the rate itself is the server's.
 */
export function formatRate(basisPoints: number): string {
  const sign = basisPoints < 0 ? '-' : '';
  const abs = Math.abs(basisPoints);
  const whole = Math.floor(abs / 100);
  const fraction = String(abs % 100)
    .padStart(2, '0')
    .replace(/0$/, '');
  return `${sign}${String(whole)}${fraction === '0' ? '' : `.${fraction}`}%`;
}

/** The cycle's dates, or "This cycle" while it is open. */
export function cycleLabel(cycle: CycleSummaryView, locale: string): string {
  return cycle.closedOn === null
    ? t('reportsPlan.cycles.thisCycle')
    : formatRange(cycle.openedOn, cycle.lastDay, locale);
}

/** One column per cycle: what the server says each spent. */
export function spentColumns(
  cycles: readonly CycleSummaryView[],
  locale: string,
): ColumnDatum[] {
  const fractions = fractionsOf(cycles.map((c) => c.spending.amountMinor));
  return cycles.map((cycle, i) => ({
    id: cycle.openedOn,
    fraction: fractions[i] ?? 0,
    valueLabel: formatMoneyShort(cycle.spending, locale),
    xLabel: formatDay(cycle.openedOn, locale),
    color: 'series-1',
  }));
}

/** One column per cycle: the change in savings. A loss has no bar. */
export function savedColumns(
  cycles: readonly CycleSummaryView[],
  locale: string,
): ColumnDatum[] {
  const fractions = fractionsOf(
    cycles.map((c) => c.savingsNetChange.amountMinor),
  );
  return cycles.map((cycle, i) => ({
    id: cycle.openedOn,
    fraction: fractions[i] ?? 0,
    valueLabel: formatMoneyShort(cycle.savingsNetChange, locale),
    xLabel: formatDay(cycle.openedOn, locale),
    color: 'series-2',
  }));
}

export type CycleRow = Readonly<{
  key: string;
  label: string;
  income: Money;
  spent: Money;
  saved: Money;
  /** The server's rate as text; null without income. */
  rate: string | null;
  amended: boolean;
}>;

/** The table of cycles, newest first, as the server sent them. */
export function cycleRows(
  cycles: readonly CycleSummaryView[],
  locale: string,
): CycleRow[] {
  return cycles.map((cycle) => ({
    key: cycle.openedOn,
    label: cycleLabel(cycle, locale),
    income: cycle.income,
    spent: cycle.spending,
    saved: cycle.savingsNetChange,
    rate: cycle.savingsRate === null ? null : formatRate(cycle.savingsRate),
    amended: cycle.amended,
  }));
}
