import { describe, expect, it } from 'vitest';
import {
  addDays,
  DateError,
  daysBetween,
  localDate,
  localDateIn,
  localDateSchema,
  nextDayOfMonth,
} from './dates.ts';

function errorCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    if (error instanceof DateError) return error.code;
    throw error;
  }
  return undefined;
}

describe('localDate', () => {
  it.each(['2026-01-31', '2024-02-29', '2000-02-29', '0001-01-01'])(
    'accepts %s',
    (text) => {
      expect(localDate(text)).toBe(text);
      expect(localDateSchema.parse(text)).toBe(text);
    },
  );

  it.each([
    '2026-02-29',
    '1900-02-29',
    '2026-04-31',
    '2026-13-01',
    '2026-00-10',
    '2026-01-00',
    '2026-1-5',
    '2026-01-05T00:00:00Z',
    ' 2026-01-05',
  ])('rejects %j', (text) => {
    expect(errorCode(() => localDate(text))).toBe('date.invalid');
    expect(localDateSchema.safeParse(text).success).toBe(false);
  });
});

describe('addDays and daysBetween', () => {
  it('crosses months, years and leap days', () => {
    expect(addDays(localDate('2026-01-31'), 1)).toBe('2026-02-01');
    expect(addDays(localDate('2024-02-28'), 1)).toBe('2024-02-29');
    expect(addDays(localDate('2026-01-01'), -1)).toBe('2025-12-31');
    expect(daysBetween(localDate('2026-03-01'), localDate('2026-04-01'))).toBe(
      31,
    );
    expect(daysBetween(localDate('2026-04-01'), localDate('2026-03-01'))).toBe(
      -31,
    );
  });

  it('ignores daylight saving changes', () => {
    // Clocks change in many zones on these dates.
    expect(daysBetween(localDate('2026-03-28'), localDate('2026-03-30'))).toBe(
      2,
    );
    expect(addDays(localDate('2026-10-24'), 2)).toBe('2026-10-26');
  });
});

describe('nextDayOfMonth', () => {
  it.each([
    ['2026-03-10', 25, '2026-03-25'],
    ['2026-03-25', 25, '2026-04-25'],
    ['2026-03-26', 25, '2026-04-25'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2026-01-31', 31, '2026-02-28'],
    ['2024-01-31', 30, '2024-02-29'],
    ['2026-02-28', 31, '2026-03-31'],
    ['2026-04-30', 31, '2026-05-31'],
  ])('after %s, day %i is %s', (after, day, expected) => {
    expect(nextDayOfMonth(localDate(after), day)).toBe(expected);
  });

  it.each([0, 32, 1.5])('rejects day %d', (day) => {
    expect(errorCode(() => nextDayOfMonth(localDate('2026-01-01'), day))).toBe(
      'date.invalid',
    );
  });
});

describe('localDateIn', () => {
  const instant = new Date('2026-03-10T23:30:00Z');

  it('gives the calendar date in a time zone', () => {
    expect(localDateIn(instant, 'UTC')).toBe('2026-03-10');
    expect(localDateIn(instant, 'Asia/Tokyo')).toBe('2026-03-11');
    expect(localDateIn(instant, 'America/Los_Angeles')).toBe('2026-03-10');
    expect(
      localDateIn(new Date('2026-03-11T05:00:00Z'), 'Pacific/Honolulu'),
    ).toBe('2026-03-10');
  });

  it('rejects an unknown time zone', () => {
    expect(errorCode(() => localDateIn(instant, 'Mars/Olympus'))).toBe(
      'date.invalid',
    );
  });
});
