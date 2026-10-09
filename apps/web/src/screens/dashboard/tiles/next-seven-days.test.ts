import {
  localDate,
  money,
  type BillView,
  type CalendarView,
} from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { upcomingItems } from './next-seven-days.ts';

const m = (n: number) => money(n, 'USD');
const day = (date: string, over: object = {}) => ({
  date: localDate(date),
  spent: null,
  heat: null,
  bills: [],
  payday: false,
  ious: [],
  ...over,
});
const labels = { payday: 'Payday', bill: 'Bill' };
const today = localDate('2026-03-10');

describe('upcomingItems', () => {
  it('lists unpaid bills, IOUs and payday inside the week, with signs', () => {
    const calendar = {
      days: [
        day('2026-03-09', {
          bills: [{ billId: 'x', amount: m(1), paid: false }],
        }),
        day('2026-03-11', {
          bills: [
            { billId: 'b1', amount: m(1200), paid: false },
            { billId: 'b2', amount: m(500), paid: true },
          ],
          payday: true,
        }),
        day('2026-03-14', {
          ious: [
            {
              iouId: 'i1',
              person: 'Sam',
              direction: 'owed-to-me',
              outstanding: m(300),
            },
          ],
        }),
        day('2026-03-17', { payday: true }),
      ],
    } as unknown as CalendarView;
    const bills = [{ id: 'b1', name: 'Rent' }] as BillView[];
    const items = upcomingItems(calendar, bills, today, labels);
    expect(
      items.map((i) => [i.date, i.kind, i.label, i.amount?.amountMinor]),
    ).toEqual([
      ['2026-03-11', 'payday', 'Payday', undefined],
      ['2026-03-11', 'bill', 'Rent', -1200],
      ['2026-03-14', 'iou', 'Sam', 300],
    ]);
  });
});
