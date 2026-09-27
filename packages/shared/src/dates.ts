import { z } from 'zod';

// Calendar dates without a time zone, such as a transaction's occurred_on
// (code-style rule "Dates and time"). The text form sorts in date order.
export type LocalDate = string & z.$brand<'LocalDate'>;

export type DateErrorCode = 'date.invalid';

export class DateError extends Error {
  override readonly name = 'DateError';
  readonly code: DateErrorCode;

  constructor(code: DateErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function isLocalDate(value: string): value is LocalDate {
  const match = LOCAL_DATE.exec(value);
  if (match === null) return false;
  const [year, month, day] = match.slice(1).map(Number) as [
    number,
    number,
    number,
  ];
  return (
    month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
  );
}

export function localDate(value: string): LocalDate {
  if (!isLocalDate(value)) {
    throw new DateError(
      'date.invalid',
      `"${value}" is not a calendar date. Use YYYY-MM-DD.`,
    );
  }
  return value;
}

export const localDateSchema = z
  .string()
  .regex(LOCAL_DATE)
  .refine(isLocalDate, { error: 'Not a calendar date' })
  .brand<'LocalDate'>();

// Calendar arithmetic runs on UTC midnights, where every day is exactly
// 86,400,000 ms long, so no time zone or daylight saving shift leaks in.
const DAY_MS = 86_400_000;

function toEpochDay(date: LocalDate): number {
  return Date.parse(`${date}T00:00:00Z`) / DAY_MS;
}

function fromEpochDay(day: number): LocalDate {
  return localDate(new Date(day * DAY_MS).toISOString().slice(0, 10));
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromEpochDay(toEpochDay(date) + days);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return toEpochDay(to) - toEpochDay(from);
}

/**
 * The first date after `after` that falls on `day` of its month. Months
 * shorter than `day` use their last day, so day 31 is 28 February.
 */
export function nextDayOfMonth(after: LocalDate, day: number): LocalDate {
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new DateError('date.invalid', `Day ${String(day)} is not 1 to 31.`);
  }
  let [year, month] = after.split('-').map(Number) as [number, number];
  for (;;) {
    const candidate = localDate(
      `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(Math.min(day, daysInMonth(year, month))).padStart(2, '0')}`,
    );
    if (candidate > after) return candidate;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
}

const dayFormatters = new Map<string, Intl.DateTimeFormat>();

/** The calendar date of an instant in an IANA time zone. */
export function localDateIn(instant: Date, timeZone: string): LocalDate {
  let formatter = dayFormatters.get(timeZone);
  if (formatter === undefined) {
    try {
      formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    } catch {
      throw new DateError('date.invalid', `Unknown time zone "${timeZone}".`);
    }
    dayFormatters.set(timeZone, formatter);
  }
  const parts = Object.fromEntries(
    formatter.formatToParts(instant).map((part) => [part.type, part.value]),
  );
  return localDate(
    `${String(parts.year).padStart(4, '0')}-${String(parts.month)}-${String(parts.day)}`,
  );
}
