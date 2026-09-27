import { money } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import {
  carryDeficit,
  dueDates,
  leftoverStays,
  reserveAtPayday,
} from './policies.ts';
import { day, usd } from './testing.ts';
import { billId, type Bill } from './types.ts';

const cycle = { from: day('2026-03-01'), to: day('2026-04-01') };

function bill(
  amountMinor: number,
  dueDay: number,
  payments: Bill['payments'] = [],
  currency = 'USD',
): Bill {
  return {
    id: billId(`bill-${String(dueDay)}`),
    amount: money(amountMinor, currency),
    dueDay,
    payments,
  };
}

describe('dueDates', () => {
  it('lists each due day in the window', () => {
    expect(dueDates(5, cycle)).toEqual(['2026-03-05']);
    expect(dueDates(1, cycle)).toEqual(['2026-03-01']);
    expect(
      dueDates(5, { from: day('2026-03-10'), to: day('2026-05-10') }),
    ).toEqual(['2026-04-05', '2026-05-05']);
    expect(
      dueDates(20, { from: day('2026-03-21'), to: day('2026-04-20') }),
    ).toEqual([]);
  });

  it('uses the last day of short months', () => {
    expect(
      dueDates(31, { from: day('2026-02-01'), to: day('2026-03-01') }),
    ).toEqual(['2026-02-28']);
  });
});

describe('reserveAtPayday', () => {
  it('reserves every bill due in the cycle from the day it opens', () => {
    const bills = [bill(20000, 5), bill(1500, 20), bill(300, 5, [], 'EUR')];
    expect(reserveAtPayday.reserved(bills, cycle, day('2026-03-01'))).toEqual(
      new Map([
        [usd, 21500n],
        ['EUR', 300n],
      ]),
    );
  });

  it('releases a bill on the day it is paid', () => {
    const paid = bill(20000, 5, [
      { dueOn: day('2026-03-05'), paidOn: day('2026-03-04') },
    ]);
    expect(reserveAtPayday.reserved([paid], cycle, day('2026-03-03'))).toEqual(
      new Map([[usd, 20000n]]),
    );
    expect(reserveAtPayday.reserved([paid], cycle, day('2026-03-04'))).toEqual(
      new Map(),
    );
  });

  it('does not count a payment for another due date', () => {
    const lastMonth = bill(20000, 5, [
      { dueOn: day('2026-02-05'), paidOn: day('2026-02-05') },
    ]);
    expect(
      reserveAtPayday.reserved([lastMonth], cycle, day('2026-03-10')),
    ).toEqual(new Map([[usd, 20000n]]));
  });
});

describe('payday settlement', () => {
  it('carries the leftover and the deficit', () => {
    expect(leftoverStays.atPayday(money(4200, 'USD'))).toEqual({
      carried: money(4200, 'USD'),
      swept: money(0, 'USD'),
    });
    expect(carryDeficit.atPayday(money(-900, 'USD'))).toEqual({
      carried: money(-900, 'USD'),
      swept: money(0, 'USD'),
    });
  });
});
