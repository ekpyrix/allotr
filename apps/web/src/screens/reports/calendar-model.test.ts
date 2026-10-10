import { localDate, money, type CalendarDayView } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import {
  baseMonth,
  dayItems,
  defaultPick,
  findDay,
  formatMonth,
  inMonth,
  weekdayNames,
} from './calendar-model.ts';

const day = (over: Partial<CalendarDayView>): CalendarDayView => ({
  date: localDate('2026-10-05'),
  spent: null,
  heat: null,
  bills: [],
  payday: false,
  ious: [],
  ...over,
});

describe('calendar tab model', () => {
  const today = localDate('2026-10-10');

  it('opens a running period on today and a closed one on its end', () => {
    expect(baseMonth(null, today)).toBe('2026-10');
    expect(baseMonth({}, today)).toBe('2026-10');
    expect(
      baseMonth(
        { from: localDate('2026-09-25'), to: localDate('2026-10-24') },
        today,
      ),
    ).toBe('2026-10');
    expect(
      baseMonth(
        { from: localDate('2026-08-25'), to: localDate('2026-09-24') },
        today,
      ),
    ).toBe('2026-09');
  });

  it('picks today in its month, else the first day', () => {
    expect(defaultPick('2026-10', today)).toBe('2026-10-10');
    expect(defaultPick('2026-09', today)).toBe('2026-09-01');
    expect(inMonth(localDate('2026-09-30'), '2026-10')).toBe(false);
    expect(inMonth(localDate('2026-10-01'), '2026-10')).toBe(true);
  });

  it('names the month and a Monday-first week', () => {
    expect(formatMonth('2026-10', 'en')).toBe('October 2026');
    expect(weekdayNames('en')).toEqual([
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun',
    ]);
  });

  it('lists payday, bills and IOUs for a day', () => {
    const items = dayItems(
      day({
        payday: true,
        bills: [
          { billId: 'b1', amount: money(-5000, 'USD'), paid: false },
          { billId: 'b2', amount: money(-900, 'USD'), paid: true },
        ],
        ious: [
          {
            iouId: 'i1',
            person: 'Alex',
            direction: 'owed-to-me',
            outstanding: money(4000, 'USD'),
          },
        ],
      }),
      new Map([['b1', 'Rent']]),
    );
    expect(items.map((i) => i.key)).toEqual([
      'payday',
      'bill-b1',
      'bill-b2',
      'iou-i1',
    ]);
    expect(items[1]).toMatchObject({ name: 'Rent', paid: false });
    expect(items[2]).toMatchObject({ name: '', paid: true });
    expect(dayItems(undefined, new Map())).toEqual([]);
  });

  it('finds a day in the list', () => {
    const days = [day({}), day({ date: localDate('2026-10-06') })];
    expect(findDay(days, localDate('2026-10-06'))).toBe(days[1]);
    expect(findDay(days, localDate('2026-10-07'))).toBeUndefined();
  });
});
