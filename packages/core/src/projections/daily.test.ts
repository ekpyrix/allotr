import { currencyCode, money, parseRate } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { transfer } from '../ledger/build.ts';
import { reverse } from '../ledger/reverse.ts';
import { meta } from '../ledger/testing.ts';
import { availableOn, dailyFigures, dailyFiguresOn } from './daily.ts';
import {
  card,
  chart,
  day,
  openingUsd,
  paycheck,
  savings,
  spend,
  view,
  wallet,
} from './testing.ts';
import { billId, type Bill } from './types.ts';

const usd = (amountMinor: number) => money(amountMinor, 'USD');

const rent: Bill = {
  id: billId('rent'),
  amount: usd(20000),
  dueDay: 5,
  payments: [],
};

describe('dailyFiguresOn', () => {
  it('matches the worked example in docs/domain.md', () => {
    // $2,000 on budget, a $200 bill reserved: $1,800 over 31 days.
    const ledger = [
      openingUsd('2026-02-20', 50000),
      paycheck('2026-03-01', 150000),
    ];
    const figures = dailyFiguresOn(
      view(ledger, { bills: [rent] }),
      day('2026-03-01'),
    );
    expect(figures).toMatchObject({
      today: '2026-03-01',
      cycleEnd: '2026-04-01',
      overdue: false,
      daysLeft: 31,
      available: usd(180000),
      startOfDay: usd(180000),
      todayAllowance: usd(5806),
      spentToday: usd(0),
      leftToday: usd(5806),
      liveDaily: usd(5806),
      missingRates: [],
    });
  });

  it('keeps the start-of-day allowance while today’s spending lowers what is left', () => {
    const ledger = [
      paycheck('2026-03-01', 310000),
      spend('2026-03-11', 2500),
      spend('2026-03-11', 1000),
    ];
    // 21 days left from the 11th; $3,100 at the start of the day.
    const figures = dailyFiguresOn(view(ledger), day('2026-03-11'));
    expect(figures).toMatchObject({
      daysLeft: 21,
      startOfDay: usd(310000),
      todayAllowance: usd(14761),
      spentToday: usd(3500),
      leftToday: usd(11261),
      available: usd(306500),
      liveDaily: usd(14595),
    });
  });

  it('lowers tomorrow’s allowance after overspending today', () => {
    const ledger = [paycheck('2026-03-01', 310000), spend('2026-03-11', 50000)];
    const tomorrow = dailyFiguresOn(view(ledger), day('2026-03-12'));
    expect(tomorrow.todayAllowance).toEqual(usd(13000));
  });

  it('lets a back-dated entry correct today’s allowance', () => {
    const before = [paycheck('2026-03-01', 310000)];
    const after = [...before, spend('2026-03-05', 21000)];
    expect(
      dailyFiguresOn(view(before), day('2026-03-11')).todayAllowance,
    ).toEqual(usd(14761));
    expect(
      dailyFiguresOn(view(after), day('2026-03-11')).todayAllowance,
    ).toEqual(usd(13761));
  });

  it('counts an undone expense back', () => {
    const coffee = spend('2026-03-11', 450);
    const ledger = [
      paycheck('2026-03-01', 310000),
      coffee,
      reverse(chart, [coffee], coffee.id, meta()),
    ];
    const figures = dailyFiguresOn(view(ledger), day('2026-03-11'));
    expect(figures.spentToday).toEqual(usd(0));
    expect(figures.available).toEqual(usd(310000));
  });

  it('leaves savings out and lowers the budget for money saved', () => {
    const ledger = [
      paycheck('2026-03-01', 310000),
      openingUsd('2026-03-01', 1000000, savings),
      transfer(chart, meta('2026-03-02'), {
        fromId: card,
        toId: savings,
        sent: usd(100000),
      }),
    ];
    const figures = dailyFiguresOn(view(ledger), day('2026-03-02'));
    expect(figures.available).toEqual(usd(210000));
    expect(figures.spentToday).toEqual(usd(0));
  });

  it('releases a reserved bill on the day it is paid', () => {
    const paid: Bill = {
      ...rent,
      payments: [{ dueOn: day('2026-03-05'), paidOn: day('2026-03-04') }],
    };
    const ledger = [paycheck('2026-03-01', 310000), spend('2026-03-04', 20000)];
    const unpaid = view(ledger, { bills: [rent] });
    const settled = view(ledger, { bills: [paid] });
    // Without the payment recorded, the bill is counted twice.
    expect(dailyFiguresOn(unpaid, day('2026-03-04')).available).toEqual(
      usd(270000),
    );
    expect(dailyFiguresOn(settled, day('2026-03-03')).available).toEqual(
      usd(290000),
    );
    expect(dailyFiguresOn(settled, day('2026-03-04')).available).toEqual(
      usd(290000),
    );
  });

  it('runs day by day once payday passes without a paycheck', () => {
    const ledger = [paycheck('2026-03-01', 310000)];
    expect(dailyFiguresOn(view(ledger), day('2026-04-01'))).toMatchObject({
      cycleEnd: '2026-04-02',
      overdue: false,
      daysLeft: 1,
    });
    expect(dailyFiguresOn(view(ledger), day('2026-04-03'))).toMatchObject({
      cycleEnd: '2026-04-04',
      overdue: true,
      daysLeft: 1,
      todayAllowance: usd(310000),
    });
  });

  it('includes a paycheck that lands today in today’s allowance', () => {
    const ledger = [
      paycheck('2026-03-01', 310000),
      spend('2026-03-31', 300000),
      paycheck('2026-04-01', 300000),
    ];
    // $100 left over plus $3,000, over the 30 days of April.
    expect(dailyFiguresOn(view(ledger), day('2026-04-01'))).toMatchObject({
      daysLeft: 30,
      startOfDay: usd(310000),
      todayAllowance: usd(10333),
    });
  });

  it('rounds a negative figure down', () => {
    const ledger = [paycheck('2026-03-01', 1000), spend('2026-03-02', 2000)];
    // -$10.00 over 30 days is -33.33… cents a day.
    expect(dailyFiguresOn(view(ledger), day('2026-03-02')).liveDaily).toEqual(
      usd(-34),
    );
  });

  it('converts other currencies and flags a missing rate', () => {
    const ledger = [
      paycheck('2026-03-01', 310000),
      openingUsd('2026-03-01', 1, card),
      spend('2026-03-02', 1000, undefined, wallet),
    ];
    const withEuros = [
      ...ledger,
      transfer(chart, meta('2026-03-02'), {
        fromId: card,
        toId: wallet,
        sent: usd(11000),
        received: money(10000, 'EUR'),
      }),
    ];
    const rates = [
      {
        base: currencyCode('EUR'),
        quote: currencyCode('USD'),
        rate: parseRate('1.2'),
        asOf: day('2026-03-01'),
      },
    ];

    const converted = dailyFiguresOn(
      view(withEuros, { rates }),
      day('2026-03-02'),
    );
    // €90.00 left in the wallet is $108.00; €10.00 spent is $12.00.
    expect(converted.available).toEqual(usd(310001 - 11000 + 10800));
    expect(converted.spentToday).toEqual(usd(1200));
    expect(converted.missingRates).toEqual([]);

    const missing = dailyFiguresOn(view(withEuros), day('2026-03-02'));
    expect(missing.available).toEqual(usd(310001 - 11000));
    expect(missing.missingRates).toEqual(['EUR']);
  });
});

describe('dailyFigures', () => {
  it('takes today from the user’s time zone', () => {
    const ledger = [paycheck('2026-03-01', 310000)];
    const now = new Date('2026-03-10T23:30:00Z');
    expect(dailyFigures(view(ledger), now, 'UTC').today).toBe('2026-03-10');
    expect(dailyFigures(view(ledger), now, 'Asia/Tokyo').today).toBe(
      '2026-03-11',
    );
  });
});

describe('availableOn', () => {
  it('gives the figure at the end of a past day', () => {
    const ledger = [paycheck('2026-03-01', 310000), spend('2026-03-05', 1000)];
    const v = view(ledger, { bills: [rent] });
    expect(availableOn(v, day('2026-03-04'), day('2026-03-20')).amount).toEqual(
      usd(290000),
    );
    expect(availableOn(v, day('2026-03-05'), day('2026-03-20')).amount).toEqual(
      usd(289000),
    );
  });
});
