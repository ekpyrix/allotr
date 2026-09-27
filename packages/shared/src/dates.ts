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
