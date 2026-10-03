import {
  money,
  type CycleDayView,
  cycleSummarySchema,
  type CycleSummaryView,
} from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import {
  categoryBars,
  categoryRows,
  dailyRows,
  isOver,
  lastRow,
  savingsCycles,
  savingsRows,
  spendingRows,
} from './chart-data.ts';

// Made-up days and categories.

const usd = (amountMinor: number) => money(amountMinor, 'USD');

function day(
  date: string,
  spent: number | null,
  allowance: number | null,
  cumulative: number | null,
  pace: number,
): CycleDayView {
  return {
    date,
    spent: spent === null ? null : usd(spent),
    cumulativeSpent: cumulative === null ? null : usd(cumulative),
    pace: usd(pace),
    availableEnd: cumulative === null ? null : usd(10_000 - cumulative),
    allowance: allowance === null ? null : usd(allowance),
  } as CycleDayView;
}

const days = [
  day('2026-03-01', 1_200, 1_000, 1_200, 1_000),
  day('2026-03-02', 500, 950, 1_700, 2_000),
  day('2026-03-03', null, null, null, 3_000),
];

describe('isOver', () => {
  it('is true only when a day’s spending passed its allowance', () => {
    expect(days.map(isOver)).toEqual([true, false, false]);
    expect(isOver(day('2026-03-04', 1_000, 1_000, 1_000, 1_000))).toBe(false);
  });
});

describe('lastRow', () => {
  it('is the last day with figures', () => {
    expect(lastRow(days)?.date).toBe('2026-03-02');
    expect(lastRow([days[2] as CycleDayView])).toBeUndefined();
  });
});

describe('table rows', () => {
  it('show every day of the spending chart, with a dash for later days', () => {
    expect(spendingRows(days, 'en-US')).toEqual([
      ['2026-03-01', 'Sunday, March 1', '$12.00', '$10.00'],
      ['2026-03-02', 'Monday, March 2', '$17.00', '$20.00'],
      ['2026-03-03', 'Tuesday, March 3', '—', '$30.00'],
    ]);
  });

  it('show days so far for the daily chart and mark those over', () => {
    expect(dailyRows(days, 'en-US')).toEqual([
      ['2026-03-01', 'Sunday, March 1', '$12.00', '$10.00', 'Over'],
      ['2026-03-02', 'Monday, March 2', '$5.00', '$9.50', ''],
    ]);
  });
});

describe('categoryBars', () => {
  const names = new Map([
    ['rent', 'Housing › Rent'],
    ['food', 'Food'],
  ]);

  it('names categories and adds Other as the server summed it', () => {
    const bars = categoryBars(
      {
        top: [
          { categoryId: 'rent', amount: usd(50_000) },
          { categoryId: 'food', amount: usd(12_000) },
        ],
        other: { count: 3, amount: usd(4_500) },
      },
      names,
    );
    expect(bars.map((bar) => bar.name)).toEqual([
      'Housing › Rent',
      'Food',
      'Other (3 categories)',
    ]);
    expect(categoryRows(bars, 'en-US')).toEqual([
      ['rent', 'Housing › Rent', '$500.00'],
      ['food', 'Food', '$120.00'],
      ['other', 'Other (3 categories)', '$45.00'],
    ]);
  });

  it('has no Other bar when nothing was folded', () => {
    expect(
      categoryBars(
        { top: [{ categoryId: null, amount: usd(100) }], other: null },
        names,
      ).map((bar) => bar.name),
    ).toEqual(['No category']);
  });
});

describe('savingsCycles', () => {
  function cycle(
    openedOn: string,
    closedOn: string | null,
    total: number,
  ): CycleSummaryView {
    return cycleSummarySchema.parse({
      openedOn,
      openedBy: null,
      closedOn,
      lastDay: closedOn ?? '2026-05-10',
      payday: '2026-06-01',
      income: usd(0),
      spending: usd(0),
      leftover: usd(0),
      savingsNetChange: usd(total - 100_000),
      savingsRate: null,
      offBudgetClosing: usd(total),
      amended: false,
      missingRates: [],
    });
  }

  it('shows the newest twelve cycles, oldest first', () => {
    // Newest first, as /v1/cycles sends them: this cycle, then the 12
    // months of 2025 and December 2024.
    const past = [
      ...Array.from({ length: 12 }, (_, at) => {
        const month = String(12 - at).padStart(2, '0');
        return cycle(`2025-${month}-01`, `2025-${month}-28`, 100_000 + at);
      }),
      cycle('2024-12-01', '2024-12-28', 100_012),
    ];
    const all = [cycle('2026-05-01', null, 130_000), ...past];
    const shown = savingsCycles(all, 'en-US');
    expect(shown).toHaveLength(12);
    expect(shown.at(-1)).toMatchObject({
      openedOn: '2026-05-01',
      label: 'This cycle',
      total: usd(130_000),
      change: usd(30_000),
    });
    expect(shown[0]?.openedOn).toBe('2025-02-01');
  });

  it('gives each cycle a table row with a signed change', () => {
    const rows = savingsRows(
      savingsCycles(
        [
          cycle('2026-05-01', null, 90_000),
          cycle('2026-04-01', '2026-04-30', 100_000),
        ],
        'en-US',
      ),
      'en-US',
    );
    expect(rows).toEqual([
      ['2026-04-01', 'Apr 1\u2009–\u200930, 2026', '$1,000.00', '$0.00'],
      ['2026-05-01', 'This cycle', '$900.00', '-$100.00'],
    ]);
  });
});
