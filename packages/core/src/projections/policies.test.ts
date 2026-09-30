import { money } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import {
  billAmount,
  carryDeficit,
  dueDates,
  leftoverStays,
  offerAdjustment,
  reserveAtPayday,
} from './policies.ts';
import { day, usd } from './testing.ts';
import { billId, type Bill } from './types.ts';

const cycle = { from: day('2026-03-01'), to: day('2026-04-01') };
const usdOf = (amountMinor: number) => money(amountMinor, 'USD');

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

describe('billAmount', () => {
  const thb = (amountMinor: number) => money(amountMinor, 'THB');
  // A subscription priced in another currency, paid from a THB account:
  // each month takes a slightly different amount.
  const subscription = (payments: Bill['payments']): Bill => ({
    ...bill(45000, 5, payments, 'THB'),
    variable: true,
  });

  it('uses the set amount until a payment took one', () => {
    expect(billAmount(subscription([]), day('2026-03-05'))).toEqual(thb(45000));
    const unlinked = subscription([
      { dueOn: day('2026-02-05'), paidOn: day('2026-02-05') },
    ]);
    expect(billAmount(unlinked, day('2026-03-05'))).toEqual(thb(45000));
  });

  it('follows the latest payment for an earlier due date', () => {
    const paid = subscription([
      { dueOn: day('2026-01-05'), paidOn: day('2026-01-06'), paid: thb(44990) },
      { dueOn: day('2026-02-05'), paidOn: day('2026-02-05'), paid: thb(45510) },
      { dueOn: day('2026-04-05'), paidOn: day('2026-04-05'), paid: thb(50000) },
    ]);
    expect(billAmount(paid, day('2026-03-05'))).toEqual(thb(45510));
  });

  it('shows what a paid due date took', () => {
    const paid = subscription([
      { dueOn: day('2026-03-05'), paidOn: day('2026-03-05'), paid: thb(46275) },
    ]);
    expect(billAmount(paid, day('2026-03-05'))).toEqual(thb(46275));
    expect(billAmount(paid, day('2026-04-05'))).toEqual(thb(46275));
  });

  it('keeps a fixed bill at its amount for later due dates', () => {
    const fixed = bill(20000, 5, [
      {
        dueOn: day('2026-02-05'),
        paidOn: day('2026-02-05'),
        paid: usdOf(21000),
      },
    ]);
    expect(billAmount(fixed, day('2026-02-05'))).toEqual(usdOf(21000));
    expect(billAmount(fixed, day('2026-03-05'))).toEqual(usdOf(20000));
  });

  it('ignores a payment in another currency than the bill', () => {
    const moved = subscription([
      {
        dueOn: day('2026-02-05'),
        paidOn: day('2026-02-05'),
        paid: usdOf(1250),
      },
    ]);
    expect(billAmount(moved, day('2026-02-05'))).toEqual(thb(45000));
    expect(billAmount(moved, day('2026-03-05'))).toEqual(thb(45000));
  });
});

describe('reserveAtPayday', () => {
  it('reserves what a variable bill last took', () => {
    const subscription: Bill = {
      ...bill(
        45000,
        5,
        [
          {
            dueOn: day('2026-02-05'),
            paidOn: day('2026-02-05'),
            paid: money(46275, 'KWD'),
          },
        ],
        'KWD',
      ),
      variable: true,
    };
    expect(
      reserveAtPayday.reserved([subscription], cycle, day('2026-03-01')),
    ).toEqual(new Map([['KWD', 46275n]]));
  });

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

describe('offerAdjustment', () => {
  it('reports a difference until the user asks for the adjustment', () => {
    expect(offerAdjustment.onDifference(false)).toBe('report');
    expect(offerAdjustment.onDifference(true)).toBe('adjust');
  });
});
