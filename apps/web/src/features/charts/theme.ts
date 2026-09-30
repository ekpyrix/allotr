import {
  formatMoneyCompact,
  money,
  type CurrencyCode,
  type LocalDate,
} from '@allotr/shared';
import { formatDay } from '@/features/today/format';

// Chart colours are theme roles (ADR 0020), so every palette theme draws
// its charts without chart-specific colours: the series in primary, the
// even pace in the neutral pace role, savings in info (never a hero
// colour), bills in the reserved role and days over their allowance in
// negative. Gridlines are outline-variant, the baseline outline, and the
// tooltip sits on the inverse surface.

export const chartColors = {
  series: 'var(--primary)',
  savings: 'var(--info)',
  savingsFill: 'var(--info-container)',
  seriesFill: 'var(--primary-container)',
  pace: 'var(--pace)',
  bill: 'var(--reserved)',
  over: 'var(--negative)',
  today: 'var(--outline)',
  grid: 'var(--outline-variant)',
  baseline: 'var(--outline)',
  tick: 'var(--text-muted)',
} as const;

/** Axis ticks: mono and small, as the rest of the figures are. */
export const tickStyle = {
  fill: chartColors.tick,
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
} as const;

/** A y-axis tick: a server amount in minor units, shortened ("$1.2K"). */
export function moneyTick(currency: CurrencyCode, locale: string) {
  return (value: number) => formatMoneyCompact(money(value, currency), locale);
}

/** An x-axis tick for a calendar day ("Mar 3"). */
export function dayTick(locale: string) {
  return (value: LocalDate) => formatDay(value, locale);
}
