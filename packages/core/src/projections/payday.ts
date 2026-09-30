import {
  addDays,
  isoWeekday,
  lastDayOfMonth,
  nextDayOfMonth,
  type LocalDate,
  type PaydayRule,
} from '@allotr/shared';

// The payday rule (docs/domain.md "Policies"): how the next payday is
// predicted when a cycle opens. A date the user sets for the open cycle
// (`paydayOverride`) beats any rule; see `cyclesOf`.

const SATURDAY = 6;

/** The last Monday-to-Friday of the month `date` is in; no holiday calendar. */
export function lastWorkingDayOfMonth(date: LocalDate): LocalDate {
  let day = lastDayOfMonth(date);
  while (isoWeekday(day) >= SATURDAY) day = addDays(day, -1);
  return day;
}

/**
 * The first predicted payday after `after`.
 *
 * - `fixed`: `day` of the month; shorter months use their last day.
 * - `last-working-day`: the last Monday-to-Friday of the month.
 * - `manual`: nothing to predict, so `day` stands in until the user sets
 *   the date for the cycle.
 */
export function nextPayday(
  rule: PaydayRule,
  day: number,
  after: LocalDate,
): LocalDate {
  if (rule !== 'last-working-day') return nextDayOfMonth(after, day);
  const thisMonth = lastWorkingDayOfMonth(after);
  if (thisMonth > after) return thisMonth;
  // The last working day is always in the month's last week, so the first
  // day of next month is past it.
  return lastWorkingDayOfMonth(addDays(lastDayOfMonth(after), 1));
}
