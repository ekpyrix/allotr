import type { CycleDayView, Money } from '@allotr/shared';
import type { Point } from '@/charts/math';
import { paceAhead, todayRow } from '@/features/today/state';

// The "this cycle" tile's view model. Every amount is a figure the server
// sent; this file only compares whole minor units and counts days.

export type PaceStatus = 'under' | 'ahead';

export interface CycleView {
  /** Pace spending so far: the series' last point. */
  spent: Money | null;
  /** The even-pace figure for today. */
  pace: Money | null;
  status: PaceStatus;
  /** Days where spending passed that day's allowance. */
  daysOver: number;
  /** 1-based day of the cycle, and how many days it has. */
  day: number;
  length: number;
  /** Cumulative pace spending per day with figures, x = day index. */
  spentPoints: Point[];
  /** The even pace from the first day to the last. */
  reference: { from: Point; to: Point } | null;
  /** Index of today in `days`; -1 when the series has no figures yet. */
  todayIndex: number;
}

export function daysOver(days: readonly CycleDayView[]): number {
  return days.filter(
    (day) =>
      day.spent !== null &&
      day.allowance !== null &&
      day.spent.amountMinor > day.allowance.amountMinor,
  ).length;
}

export function cycleView(days: readonly CycleDayView[]): CycleView {
  const row = todayRow(days);
  const todayIndex = row === undefined ? -1 : days.indexOf(row);
  const first = days[0];
  const last = days.at(-1);
  return {
    spent: row?.cumulativeSpent ?? null,
    pace: row?.pace ?? null,
    status: paceAhead(days) ? 'ahead' : 'under',
    daysOver: daysOver(days),
    day: todayIndex + 1,
    length: days.length,
    spentPoints: days.flatMap((day, x) =>
      day.cumulativeSpent === null
        ? []
        : [{ x, y: day.cumulativeSpent.amountMinor }],
    ),
    reference:
      first === undefined || last === undefined
        ? null
        : {
            from: { x: 0, y: first.pace.amountMinor },
            to: { x: days.length - 1, y: last.pace.amountMinor },
          },
    todayIndex,
  };
}
