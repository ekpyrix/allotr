import { calendar, MAX_CALENDAR_DAYS } from '@allotr/core';
import {
  addDays,
  daysBetween,
  lastDayOfMonth,
  localDate,
  localDateIn,
  type CalendarView,
  type LocalDate,
} from '@allotr/shared';
import type { Kysely } from 'kysely';
import type { DB } from '../db/schema.ts';
import { RequestProblem } from '../http/domain-errors.ts';
import { loadView } from './today.ts';

// The calendar (FR-W2): per-day spending and what falls due, computed from
// the ledger on each read.

export async function calendarView(
  db: Kysely<DB>,
  userId: string,
  range: { from?: LocalDate | undefined; to?: LocalDate | undefined },
  now: Date,
): Promise<CalendarView> {
  const loaded = await db.transaction().execute((trx) => loadView(trx, userId));
  const today = localDateIn(now, loaded.timeZone);
  const from = range.from ?? localDate(`${today.slice(0, 7)}-01`);
  const to = range.to ?? lastDayOfMonth(from);
  const days = daysBetween(from, to) + 1;
  if (days < 1 || days > MAX_CALENDAR_DAYS)
    throw new RequestProblem(
      400,
      'invalid_range',
      `A calendar covers 1 to ${String(MAX_CALENDAR_DAYS)} days; ${from} to ${to} is ${String(days)}.`,
    );
  const result = calendar(loaded.view, from, to, today);
  return {
    from,
    to: addDays(from, days - 1),
    today,
    days: result.days.map((day) => ({
      date: day.date,
      spent: day.spent,
      heat: day.heat,
      bills: day.bills.map((b) => ({ ...b })),
      payday: day.payday,
      ious: day.ious.map((i) => ({ ...i })),
    })),
    peak: result.peak,
    missingRates: [...result.missingRates],
  };
}
