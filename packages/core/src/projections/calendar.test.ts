import { money } from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { calendar, heatLevel } from './calendar.ts';
import { iouId } from './ious.ts';
import { day, paycheck, spend, view, viewFrom } from './testing.ts';
import { billId } from './types.ts';

const usd = (amountMinor: number) => money(amountMinor, 'USD');

// April 2026: payday on the 1st, spending on the 3rd, rent due on the 5th.
const rentPaid = spend('2026-04-05', 80000);
const ledger = [
  paycheck('2026-04-01', 300000),
  spend('2026-04-03', 2500),
  spend('2026-04-03', 500),
  spend('2026-04-04', 1000),
  rentPaid,
];
const base = viewFrom('2026-04-01', ledger);
const withBill = view(ledger, {
  settings: base.settings,
  bills: [
    {
      id: billId('rent'),
      amount: usd(80000),
      dueDay: 5,
      payments: [
        {
          dueOn: day('2026-04-05'),
          paidOn: day('2026-04-05'),
          transactionId: rentPaid.id,
        },
      ],
    },
    { id: billId('phone'), amount: usd(3000), dueDay: 20, payments: [] },
  ],
  ious: {
    ious: [
      {
        id: iouId('i1'),
        direction: 'owed-to-me',
        person: 'Alex Example',
        amount: usd(4000),
        originId: spend('2026-04-02', 1).id,
        recordedOn: day('2026-04-02'),
        dueOn: day('2026-04-12'),
        settlements: [],
      },
    ],
    writeOffAfterDays: 90,
  },
});

describe('calendar', () => {
  const result = calendar(
    withBill,
    day('2026-04-01'),
    day('2026-04-30'),
    day('2026-04-10'),
  );
  const on = (date: string) => result.days.find((d) => d.date === date);

  it('has one row per day of the range', () => {
    expect(result.days).toHaveLength(30);
    expect(result.days[0]?.date).toBe('2026-04-01');
  });

  it('spends what the day spent and nothing after today', () => {
    expect(on('2026-04-03')?.spent).toEqual(usd(3000));
    expect(on('2026-04-02')?.spent).toEqual(usd(0));
    expect(on('2026-04-11')?.spent).toBeNull();
    expect(on('2026-04-11')?.heat).toBeNull();
  });

  it('leaves a linked bill payment out of the heat', () => {
    expect(on('2026-04-05')?.spent).toEqual(usd(0));
    expect(on('2026-04-05')?.heat).toBe(0);
    expect(result.peak).toEqual(usd(3000));
  });

  it('scales the heat to the busiest day', () => {
    expect(on('2026-04-03')?.heat).toBe(4);
    expect(on('2026-04-04')?.heat).toBe(2);
  });

  it('marks bills, payday and IOU due dates', () => {
    expect(on('2026-04-05')?.bills).toEqual([
      { billId: 'rent', amount: usd(80000), paid: true },
    ]);
    expect(on('2026-04-20')?.bills).toEqual([
      { billId: 'phone', amount: usd(3000), paid: false },
    ]);
    expect(on('2026-04-01')?.payday).toBe(true);
    expect(on('2026-04-30')?.payday).toBe(false);
    const later = calendar(
      withBill,
      day('2026-04-29'),
      day('2026-05-02'),
      day('2026-04-10'),
    );
    expect(later.days.find((d) => d.date === '2026-05-01')?.payday).toBe(true);
    expect(on('2026-04-12')?.ious).toEqual([
      {
        iouId: 'i1',
        person: 'Alex Example',
        direction: 'owed-to-me',
        outstanding: usd(4000),
      },
    ]);
  });

  it('refuses a range that is empty or too long', () => {
    expect(() =>
      calendar(base, day('2026-04-02'), day('2026-04-01'), day('2026-04-10')),
    ).toThrow(RangeError);
    expect(() =>
      calendar(base, day('2026-01-01'), day('2026-04-01'), day('2026-04-10')),
    ).toThrow(RangeError);
  });
});

describe('heatLevel', () => {
  it('is zero for nothing and rounds up to the peak', () => {
    expect(heatLevel(0, 1000)).toBe(0);
    expect(heatLevel(1, 1000)).toBe(1);
    expect(heatLevel(250, 1000)).toBe(1);
    expect(heatLevel(251, 1000)).toBe(2);
    expect(heatLevel(1000, 1000)).toBe(4);
    expect(heatLevel(500, 0)).toBe(0);
  });
});

describe('heatLevel properties', () => {
  it('stays within the levels and never falls as spending rises', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        (a, b, peak) => {
          const [low, high] = a <= b ? [a, b] : [b, a];
          const lower = heatLevel(low, peak);
          const higher = heatLevel(Math.min(high, peak), peak);
          expect(lower).toBeGreaterThanOrEqual(0);
          expect(higher).toBeLessThanOrEqual(4);
          expect(heatLevel(Math.min(low, peak), peak)).toBeLessThanOrEqual(
            higher,
          );
        },
      ),
    );
  });
});
