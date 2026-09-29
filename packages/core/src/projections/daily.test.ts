import { currencyCode, money, parseRate } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { budgetSwitch, opening, transfer, writeOff } from '../ledger/build.ts';
import { reverse } from '../ledger/reverse.ts';
import { meta } from '../ledger/testing.ts';
import { accountId } from '../ledger/types.ts';
import {
  availableOn,
  dailyFigures,
  dailyFiguresOn,
  leftTodayDrop,
} from './daily.ts';
import {
  card,
  cash,
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

describe('cycle spending', () => {
  it('adds up on-budget spending since the cycle opened, less undos', () => {
    const lunch = spend('2026-03-04', 1500);
    const ledger = [
      openingUsd('2026-02-18', 100000),
      spend('2026-02-25', 9900),
      paycheck('2026-03-01', 310000),
      spend('2026-03-02', 2500),
      lunch,
      reverse(chart, [lunch], lunch.id, meta()),
      spend('2026-03-05', 4000, undefined, savings),
      spend('2026-03-06', 1000),
    ];
    // The February entry belongs to the previous cycle, the undone lunch
    // nets to zero and the savings spend is off budget.
    const figures = dailyFiguresOn(view(ledger), day('2026-03-06'));
    expect(figures.cycleSpent).toEqual(usd(3500));
    expect(figures.spentToday).toEqual(usd(1000));
  });

  it('counts each entry by the budget group of its own day', () => {
    const before = [
      paycheck('2026-03-01', 310000),
      spend('2026-03-02', 2000, undefined, savings),
    ];
    const ledger = [
      ...before,
      budgetSwitch(chart, before, meta('2026-03-03'), {
        accountId: savings,
        budgetGroup: 'on',
      }),
      spend('2026-03-04', 700, undefined, savings),
    ];
    // Savings joined the budget on the 3rd, so only the later spend counts.
    expect(dailyFiguresOn(view(ledger), day('2026-03-04')).cycleSpent).toEqual(
      usd(700),
    );
  });

  it('leaves linked bill payments and reconcile adjustments out of pace', () => {
    const rentPaid = spend('2026-03-05', 20000);
    const unrecorded = spend('2026-03-06', 1200);
    const ledger = [
      paycheck('2026-03-01', 310000),
      spend('2026-03-02', 2500),
      rentPaid,
      unrecorded,
    ];
    const paid: Bill = {
      ...rent,
      payments: [
        {
          dueOn: day('2026-03-05'),
          paidOn: day('2026-03-05'),
          transactionId: rentPaid.id,
        },
      ],
    };
    const figures = dailyFiguresOn(
      view(ledger, {
        bills: [paid],
        reconcileAdjustments: new Set([unrecorded.id]),
      }),
      day('2026-03-06'),
    );
    // Both still count as spending and lower what is available.
    expect(figures.cycleSpent).toEqual(usd(23700));
    expect(figures.available).toEqual(usd(310000 - 23700));
    expect(figures.paceSpent).toEqual(usd(2500));
  });

  it('counts an unlinked bill payment toward pace', () => {
    const rentPaid = spend('2026-03-05', 20000);
    const paid: Bill = {
      ...rent,
      payments: [{ dueOn: day('2026-03-05'), paidOn: day('2026-03-05') }],
    };
    const figures = dailyFiguresOn(
      view([paycheck('2026-03-01', 310000), rentPaid], { bills: [paid] }),
      day('2026-03-06'),
    );
    expect(figures.paceSpent).toEqual(usd(20000));
  });

  it('leaves the undo of a left-out entry out of pace too', () => {
    const unrecorded = spend('2026-03-06', 1200);
    const undo = reverse(
      chart,
      [unrecorded],
      unrecorded.id,
      meta('2026-03-07'),
    );
    const figures = dailyFiguresOn(
      view([paycheck('2026-03-01', 310000), undo, unrecorded], {
        reconcileAdjustments: new Set([unrecorded.id]),
      }),
      day('2026-03-07'),
    );
    expect(figures.cycleSpent).toEqual(usd(0));
    expect(figures.paceSpent).toEqual(usd(0));
  });
});

describe('billsDueOn', () => {
  const phone: Bill = {
    id: billId('phone'),
    amount: usd(4500),
    dueDay: 3,
    payments: [],
  };

  it('lists unpaid due dates up to today, earliest first', () => {
    const ledger = [paycheck('2026-03-01', 310000)];
    const bills = [rent, phone];
    expect(
      dailyFiguresOn(view(ledger, { bills }), day('2026-03-02')).billsDue,
    ).toEqual([]);
    expect(
      dailyFiguresOn(view(ledger, { bills }), day('2026-03-05')).billsDue,
    ).toEqual([
      { billId: 'phone', dueOn: '2026-03-03', amount: usd(4500) },
      { billId: 'rent', dueOn: '2026-03-05', amount: usd(20000) },
    ]);
  });

  it('drops a due date once it is paid, from the day it was paid', () => {
    const ledger = [paycheck('2026-03-01', 310000)];
    const paid: Bill = {
      ...rent,
      payments: [{ dueOn: day('2026-03-05'), paidOn: day('2026-03-07') }],
    };
    const on = (date: string) =>
      dailyFiguresOn(view(ledger, { bills: [paid] }), day(date)).billsDue;
    expect(on('2026-03-06')).toHaveLength(1);
    expect(on('2026-03-07')).toEqual([]);
  });

  it('keeps an unpaid bill due while payday is overdue', () => {
    const ledger = [paycheck('2026-03-01', 310000)];
    const late: Bill = { ...rent, dueDay: 30 };
    const figures = dailyFiguresOn(
      view(ledger, { bills: [late] }),
      day('2026-04-02'),
    );
    expect(figures.overdue).toBe(true);
    expect(figures.billsDue.map((b) => b.dueOn)).toEqual(['2026-03-30']);
  });
});

describe('cycleBills', () => {
  it('lists every due date in the cycle with its payment day', () => {
    const ledger = [paycheck('2026-03-01', 310000)];
    const paid: Bill = {
      ...rent,
      payments: [{ dueOn: day('2026-03-05'), paidOn: day('2026-03-04') }],
    };
    const phone: Bill = {
      id: billId('phone'),
      amount: usd(4500),
      dueDay: 20,
      payments: [],
    };
    expect(
      dailyFiguresOn(view(ledger, { bills: [phone, paid] }), day('2026-03-02'))
        .cycleBills,
    ).toEqual([
      {
        billId: 'rent',
        dueOn: '2026-03-05',
        amount: usd(20000),
        paidOn: '2026-03-04',
      },
      { billId: 'phone', dueOn: '2026-03-20', amount: usd(4500), paidOn: null },
    ]);
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

describe('leftTodayDrop', () => {
  // $3,100.00 on budget, 21 days left on the 11th: $147.61 a day.
  const today = day('2026-03-11');
  const ledger = [
    paycheck('2026-03-01', 310000),
    openingUsd('2026-03-01', 50000, savings),
  ];

  it('counts a write-off from an on-budget account as spending', () => {
    const entry = writeOff(chart, meta('2026-03-11'), {
      accountId: card,
      balance: usd(25000),
    });
    expect(leftTodayDrop(view(ledger), today, entry)).toEqual(usd(25000));
  });

  it('lowers the allowance for a transfer to savings', () => {
    const entry = transfer(chart, meta('2026-03-11'), {
      fromId: card,
      toId: savings,
      sent: usd(100000),
    });
    // $3,100.00 / 21 = $147.61 before, $2,100.00 / 21 = $100.00 after.
    expect(leftTodayDrop(view(ledger), today, entry)).toEqual(usd(4761));
  });

  it('matches the figures before and after the entry is recorded', () => {
    const entry = transfer(chart, meta('2026-03-11'), {
      fromId: card,
      toId: savings,
      sent: usd(12345),
    });
    const before = dailyFiguresOn(view(ledger), today).leftToday;
    const after = dailyFiguresOn(view([...ledger, entry]), today).leftToday;
    expect(leftTodayDrop(view(ledger), today, entry)).toEqual(
      usd(before.amountMinor - after.amountMinor),
    );
  });

  it('is zero for a write-off from savings or a transfer within the budget', () => {
    const fromSavings = writeOff(chart, meta('2026-03-11'), {
      accountId: savings,
      balance: usd(50000),
    });
    const withinBudget = transfer(chart, meta('2026-03-11'), {
      fromId: card,
      toId: cash,
      sent: usd(100000),
    });
    expect(leftTodayDrop(view(ledger), today, fromSavings)).toEqual(usd(0));
    expect(leftTodayDrop(view(ledger), today, withinBudget)).toEqual(usd(0));
  });

  it('is negative for a transfer out of savings', () => {
    const entry = transfer(chart, meta('2026-03-11'), {
      fromId: savings,
      toId: card,
      sent: usd(21000),
    });
    // $3,310.00 / 21 = $157.61.
    expect(leftTodayDrop(view(ledger), today, entry)).toEqual(usd(-1000));
  });

  it('converts write-offs in 0- and 3-digit currencies to the default one', () => {
    const yen = accountId('card-JPY');
    const dinar = accountId('card-KWD');
    const withForeign = [
      ...ledger,
      opening(chart, meta('2026-03-01'), {
        accountId: yen,
        amount: money(1500, 'JPY'),
      }),
      opening(chart, meta('2026-03-01'), {
        accountId: dinar,
        amount: money(1500, 'KWD'),
      }),
    ];
    const rates = [
      {
        base: currencyCode('JPY'),
        quote: currencyCode('USD'),
        rate: parseRate('0.0067'),
        asOf: day('2026-03-01'),
      },
      {
        base: currencyCode('KWD'),
        quote: currencyCode('USD'),
        rate: parseRate('3.25'),
        asOf: day('2026-03-01'),
      },
    ];
    const rated = view(withForeign, { rates });
    const yenOff = writeOff(chart, meta('2026-03-11'), {
      accountId: yen,
      balance: money(1500, 'JPY'),
    });
    const dinarOff = writeOff(chart, meta('2026-03-11'), {
      accountId: dinar,
      balance: money(1500, 'KWD'),
    });
    // ¥1,500 is $10.05; KWD 1.500 is $4.875, rounded half to even.
    expect(leftTodayDrop(rated, today, yenOff)).toEqual(usd(1005));
    expect(leftTodayDrop(rated, today, dinarOff)).toEqual(usd(488));
    // Without a rate the currency is left out of the figure entirely.
    expect(leftTodayDrop(view(withForeign), today, yenOff)).toEqual(usd(0));
  });
});
