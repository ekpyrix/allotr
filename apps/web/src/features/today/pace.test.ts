import { money, todaySchema, type TodayView } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { paceOf } from './pace.ts';

const usd = (amountMinor: number) => money(amountMinor, 'USD');

// A made-up 31-day cycle from 1 March to payday on 1 April.
function figures(overrides: object): TodayView {
  return todaySchema.parse({
    today: '2026-03-11',
    cycle: { openedOn: '2026-03-01', openedBy: null, payday: '2026-04-01' },
    cycleEnd: '2026-04-01',
    overdue: false,
    daysLeft: 21,
    available: usd(0),
    startOfDay: usd(0),
    spentToday: usd(0),
    todayAllowance: usd(0),
    leftToday: usd(0),
    liveDaily: usd(0),
    cycleSpent: usd(0),
    paceSpent: usd(0),
    billsDue: [],
    cycleBills: [],
    missingRates: [],
    ...overrides,
  });
}

describe('paceOf', () => {
  it('sets the share spent against the days gone, today included', () => {
    expect(
      paceOf(figures({ paceSpent: usd(20000), available: usd(80000) })),
    ).toEqual({
      day: 11,
      days: 31,
      spentPercent: 20,
      timePercent: 35,
      ahead: false,
    });
  });

  it('is ahead when spending outruns the days', () => {
    expect(
      paceOf(figures({ paceSpent: usd(60000), available: usd(40000) })),
    ).toMatchObject({ spentPercent: 60, ahead: true });
  });

  it('passes 100% when the budget is overspent', () => {
    expect(
      paceOf(figures({ paceSpent: usd(50000), available: usd(-10000) })),
    ).toMatchObject({ spentPercent: 125, ahead: true });
    expect(
      paceOf(figures({ paceSpent: usd(5000), available: usd(-9000) })),
    ).toMatchObject({ spentPercent: 100, ahead: true });
  });

  it('has nothing to show with no money and no spending', () => {
    expect(paceOf(figures({}))).toBeNull();
  });

  it('stays within the cycle while payday is overdue', () => {
    expect(
      paceOf(
        figures({
          today: '2026-04-03',
          cycleEnd: '2026-04-04',
          overdue: true,
          daysLeft: 1,
          paceSpent: usd(90000),
          available: usd(10000),
        }),
      ),
    ).toMatchObject({ day: 34, days: 34, timePercent: 100, ahead: false });
  });
});
