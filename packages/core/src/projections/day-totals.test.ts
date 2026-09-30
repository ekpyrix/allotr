import { currencyCode, money, parseRate } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { transfer } from '../ledger/build.ts';
import { reverse } from '../ledger/reverse.ts';
import { food, meta } from '../ledger/testing.ts';
import { transactionId } from '../ledger/types.ts';
import { dayNetTotals } from './day-totals.ts';
import {
  card,
  cash,
  chart,
  day,
  paycheck,
  spend,
  usd,
  wallet,
} from './testing.ts';

const dollars = (amountMinor: number) => money(amountMinor, 'USD');

describe('dayNetTotals', () => {
  it('nets spending and income per day, newest first', () => {
    const entries = [
      paycheck('2026-04-01', 300000),
      spend('2026-04-01', 2500),
      spend('2026-04-02', 1000),
      spend('2026-04-02', 500),
    ];
    expect(dayNetTotals(chart, entries, [], usd)).toEqual([
      { date: '2026-04-02', net: dollars(-1500), missingRates: [] },
      { date: '2026-04-01', net: dollars(297500), missingRates: [] },
    ]);
  });

  it('nets a transfer between own accounts to nothing', () => {
    const moved = transfer(chart, meta('2026-04-03'), {
      fromId: card,
      toId: cash,
      sent: dollars(4000),
      received: dollars(4000),
    });
    expect(dayNetTotals(chart, [moved], [], usd)).toEqual([
      { date: '2026-04-03', net: dollars(0), missingRates: [] },
    ]);
    // Filtered to one account, the list shows only its side.
    expect(dayNetTotals(chart, [moved], [], usd, cash)[0]?.net).toEqual(
      dollars(4000),
    );
  });

  it('cancels an entry with its undo', () => {
    const lunch = spend('2026-04-04', 1250);
    const undo = reverse(chart, [lunch], lunch.id, {
      id: transactionId('undo'),
      createdAt: '2026-04-05T09:00:00.000Z',
    });
    expect(dayNetTotals(chart, [lunch, undo], [], usd)[0]?.net).toEqual(
      dollars(0),
    );
  });

  it('converts at the day’s rate and lists missing rates', () => {
    const euros = spend('2026-04-06', 1000, food, wallet);
    const withRate = dayNetTotals(
      chart,
      [euros],
      [
        {
          base: currencyCode('EUR'),
          quote: usd,
          rate: parseRate('1.1'),
          asOf: day('2026-04-01'),
        },
      ],
      usd,
    );
    expect(withRate[0]).toEqual({
      date: '2026-04-06',
      net: dollars(-1100),
      missingRates: [],
    });
    expect(dayNetTotals(chart, [euros], [], usd)[0]).toMatchObject({
      net: dollars(0),
      missingRates: ['EUR'],
    });
  });
});
