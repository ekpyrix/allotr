import type { CycleDayView, TodayView } from '@allotr/shared';

// The hero's state (spec §2.4, §11.1): calm, with no alarm red. `over` once
// today's spending passes today's allowance; `tight` when a quarter or
// less of the allowance is left, or spending runs ahead of an even pace;
// `ok` otherwise. Every figure comes from the server; these are
// comparisons of whole minor units, never new amounts.

export type HeroState = 'ok' | 'tight' | 'over';

export function heroState(
  figures: Pick<TodayView, 'leftToday' | 'todayAllowance'>,
  paceAhead: boolean,
): HeroState {
  const left = figures.leftToday.amountMinor;
  if (left < 0) return 'over';
  if (left === 0 || left * 4 < figures.todayAllowance.amountMinor || paceAhead)
    return 'tight';
  return 'ok';
}

/** Today's row of the cycle series: the last day with figures. */
export function todayRow(
  days: readonly CycleDayView[],
): CycleDayView | undefined {
  return days.filter((day) => day.cumulativeSpent !== null).at(-1);
}

/** Pace spending so far runs ahead of the even pace for today. */
export function paceAhead(days: readonly CycleDayView[]): boolean {
  const row = todayRow(days);
  return (
    row?.cumulativeSpent !== undefined &&
    row.cumulativeSpent !== null &&
    row.cumulativeSpent.amountMinor > row.pace.amountMinor
  );
}
