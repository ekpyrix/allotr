import { daysBetween, type TodayView } from '@allotr/shared';

// The cycle's spending pace (docs/domain.md "Daily usable"): the share of
// the cycle's money spent so far against the share of its days gone,
// today included. Money is `cycleSpent + available`, so income during the
// cycle raises it.

export interface Pace {
  /** Days gone through the end of today, and the cycle's length. */
  day: number;
  days: number;
  /** Whole percentages; `spentPercent` passes 100 when overspent. */
  spentPercent: number;
  timePercent: number;
  /** Spending runs ahead of the days. */
  ahead: boolean;
}

export function paceOf(figures: TodayView): Pace | null {
  const days = Math.max(
    1,
    daysBetween(figures.cycle.openedOn, figures.cycleEnd),
  );
  const day = Math.min(
    days,
    daysBetween(figures.cycle.openedOn, figures.today) + 1,
  );
  const spent = figures.cycleSpent.amountMinor;
  const budget = spent + figures.available.amountMinor;
  // Nothing spent and nothing to spend: there is no pace to show.
  if (spent <= 0 && budget <= 0) return null;
  const timeShare = day / days;
  const timePercent = Math.round(timeShare * 100);
  // Available at or below minus what was spent: all of it is gone.
  if (budget <= 0)
    return { day, days, spentPercent: 100, timePercent, ahead: true };
  const spentShare = spent / budget;
  return {
    day,
    days,
    spentPercent: Math.round(spentShare * 100),
    timePercent,
    ahead: spentShare > timeShare,
  };
}
