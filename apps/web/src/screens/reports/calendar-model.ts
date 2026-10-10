import {
  localDate,
  type CalendarDayView,
  type LocalDate,
  type Money,
} from '@allotr/shared';
import type { DateRange } from '../transactions/period.ts';

// The calendar tab's pure helpers. No money is computed here: every amount
// shown is the server's.

/** `YYYY-MM` of a date. */
export function monthOf(date: LocalDate): string {
  return date.slice(0, 7);
}

/**
 * The month the tab opens on for a period: the month of its last day that
 * has happened (a running cycle opens on today's month, a closed one on the
 * month it ended in). No dates falls back to today's month.
 */
export function baseMonth(range: DateRange | null, today: LocalDate): string {
  const end = range?.to;
  if (end === undefined) return monthOf(today);
  return monthOf(end < today ? end : today);
}

/** The day the list opens on: today in its own month, else the first. */
export function defaultPick(month: string, today: LocalDate): LocalDate {
  return monthOf(today) === month ? today : localDate(`${month}-01`);
}

/** Whether `date` falls in `month`. */
export function inMonth(date: LocalDate, month: string): boolean {
  return monthOf(date) === month;
}

const monthFormatters = new Map<string, Intl.DateTimeFormat>();

/** "October 2026" in the user's locale; never shifted by zone. */
export function formatMonth(month: string, locale: string): string {
  let formatter = monthFormatters.get(locale);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat(locale, {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
    monthFormatters.set(locale, formatter);
  }
  return formatter.format(new Date(`${month}-01T00:00:00Z`));
}

/** Seven short weekday names, Monday first. */
export function weekdayNames(locale: string): string[] {
  const formatter = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    timeZone: 'UTC',
  });
  // 2026-06-01 is a Monday.
  return Array.from({ length: 7 }, (_, i) =>
    formatter.format(new Date(Date.UTC(2026, 5, 1 + i))),
  );
}

export type DayItem =
  | {
      key: string;
      type: 'bill';
      name: string;
      paid: boolean;
      amount: Money;
    }
  | { key: string; type: 'payday' }
  | {
      key: string;
      type: 'iou';
      person: string;
      direction: 'owed-to-me' | 'owed-by-me';
      amount: Money;
    };

/** What falls due on a day, in a stable order: payday, bills, IOUs. */
export function dayItems(
  day: CalendarDayView | undefined,
  billNames: ReadonlyMap<string, string>,
): DayItem[] {
  if (day === undefined) return [];
  return [
    ...(day.payday ? [{ key: 'payday', type: 'payday' as const }] : []),
    ...day.bills.map((b) => ({
      key: `bill-${b.billId}`,
      type: 'bill' as const,
      name: billNames.get(b.billId) ?? '',
      paid: b.paid,
      amount: b.amount,
    })),
    ...day.ious.map((i) => ({
      key: `iou-${i.iouId}`,
      type: 'iou' as const,
      person: i.person,
      direction: i.direction,
      amount: i.outstanding,
    })),
  ];
}

/** The day in the server's list, if the month has it. */
export function findDay(
  days: readonly CalendarDayView[],
  date: LocalDate,
): CalendarDayView | undefined {
  return days.find((d) => d.date === date);
}
