import type { Money, NetWorthView } from '@allotr/shared';
import { formatDay, formatLongDay } from '@/features/today/format';

// Rows for the plan charts and tables. Nothing is summed: each is a point
// the server sent.

export interface NetWorthRow {
  readonly key: string;
  readonly label: string;
  readonly short: string;
  readonly amount: Money;
}

type Series = NetWorthView['series'];

export function netWorthRows(series: Series, locale: string): NetWorthRow[] {
  return series.map((point) => ({
    key: point.date,
    label: formatLongDay(point.date, locale),
    short: formatDay(point.date, locale),
    amount: point.amount,
  }));
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
