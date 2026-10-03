import {
  addDays,
  isoWeekday,
  lastDayOfMonth,
  localDate,
  type CalendarDayView,
  type LocalDate,
} from '@allotr/shared';

// The month grid's shape. Weeks start on Monday. No money here: amounts
// are the server's.

export interface MonthRange {
  /** `YYYY-MM`. */
  readonly month: string;
  readonly from: LocalDate;
  readonly to: LocalDate;
}

export function monthRange(month: string): MonthRange {
  const from = localDate(`${month}-01`);
  return { month, from, to: lastDayOfMonth(from) };
}

/** The month before or after, as `YYYY-MM`. */
export function shiftMonth(range: MonthRange, delta: -1 | 1): MonthRange {
  const day = delta < 0 ? addDays(range.from, -1) : addDays(range.to, 1);
  return monthRange(day.slice(0, 7));
}

/** Empty cells before the first day, with the week starting on Monday. */
export function leadingBlanks(from: LocalDate): number {
  return isoWeekday(from) - 1;
}

/** Days with something due: a bill, a payday or an IOU. */
export function hasDue(day: CalendarDayView): boolean {
  return day.bills.length > 0 || day.payday || day.ious.length > 0;
}
