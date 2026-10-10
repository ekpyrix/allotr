import { localDate, money as sharedMoney } from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type {
  BudgetView,
  CategorySummaryView,
  CategoryView,
  CycleDayView,
  CycleSummaryView,
  Money,
} from '@allotr/shared';
import {
  budgetsByCategory,
  categoryRows,
  cycleDayFigures,
  cycleOf,
  dayChart,
  fractionOf,
  periodTotal,
  reportParams,
  shareSegments,
  sharePercent,
  statFigures,
  visibleRows,
} from './summary-model.ts';

const money = (amountMinor: number, currency = 'USD'): Money =>
  sharedMoney(amountMinor, currency);

function category(id: string, parentId: string | null): CategoryView {
  return {
    id,
    name: id,
    kind: 'expense',
    parentId,
    isPaycheck: false,
    position: 0,
    colour: null,
    icon: null,
    mergedIntoId: null,
  };
}

const categories = [
  category('food', null),
  category('pantry', 'food'),
  category('takeaway', 'food'),
  category('rent', null),
];

const summary = (
  spending: CategorySummaryView['spending'],
  totals: number[] = [1000],
): CategorySummaryView =>
  ({
    period: 'cycle',
    from: '2026-10-01',
    to: '2026-10-31',
    spending,
    income: [],
    missingRates: [],
    series: {
      periods: totals.map(() => ({ from: '2026-10-01', to: '2026-10-31' })),
      groups: [],
      totals: totals.map((n) => money(n)),
      missingRates: [],
    },
  }) as unknown as CategorySummaryView;

describe('reportParams', () => {
  it('maps each period to a report query', () => {
    expect(reportParams('cycle', {})).toEqual({ period: 'cycle' });
    expect(reportParams('month', {})).toEqual({ period: 'month' });
    expect(
      reportParams('last-cycle', {
        from: localDate('2026-09-01'),
        to: localDate('2026-09-30'),
      }),
    ).toEqual({ period: 'cycle', cycle: '2026-09-01' });
    expect(
      reportParams('last-month', {
        from: localDate('2026-09-01'),
        to: localDate('2026-09-30'),
      }),
    ).toEqual({ period: 'month', month: '2026-09' });
  });

  it('has no query for a last cycle that does not exist', () => {
    expect(reportParams('last-cycle', null)).toBeNull();
    expect(reportParams('last-month', null)).toBeNull();
  });
});

describe('cycleOf and statFigures', () => {
  const cycle = (openedOn: string) =>
    ({
      openedOn,
      spending: money(500),
      income: money(2000),
      savingsNetChange: money(300),
    }) as unknown as CycleSummaryView;
  const list = [cycle('2026-10-01'), cycle('2026-09-01')];

  it('picks the open or the previous cycle, and none for months', () => {
    expect(cycleOf('cycle', list)?.openedOn).toBe('2026-10-01');
    expect(cycleOf('last-cycle', list)?.openedOn).toBe('2026-09-01');
    expect(cycleOf('month', list)).toBeNull();
    expect(cycleOf('last-cycle', [cycle('2026-10-01')])).toBeNull();
  });

  it('reads cycle figures as sent, and leaves a month with its total only', () => {
    expect(statFigures(list[0] ?? null, null)).toEqual({
      spent: money(500),
      income: money(2000),
      saved: money(300),
    });
    expect(statFigures(null, money(900))).toEqual({
      spent: money(900),
      income: null,
      saved: null,
    });
  });
});

describe('periodTotal', () => {
  it('is the last total of the series', () => {
    expect(periodTotal(summary([], [100, 250]))).toEqual(money(250));
  });
});

describe('fractionOf and sharePercent', () => {
  it('stays within 0..1', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (part, whole) => {
        const f = fractionOf(part, whole);
        expect(f).toBeGreaterThanOrEqual(0);
        expect(f).toBeLessThanOrEqual(1);
      }),
    );
  });

  it('is monotone in the part', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        (a, b, whole) => {
          const [lo, hi] = a <= b ? [a, b] : [b, a];
          expect(fractionOf(lo, whole)).toBeLessThanOrEqual(
            fractionOf(hi, whole),
          );
        },
      ),
    );
  });

  it('is empty for nothing or no whole', () => {
    expect(fractionOf(5, 0)).toBe(0);
    expect(fractionOf(0, 5)).toBe(0);
    expect(fractionOf(-1, 5)).toBe(0);
  });

  it('writes a share as text', () => {
    expect(sharePercent(0)).toBe('0%');
    expect(sharePercent(0.004)).toBe('<1%');
    expect(sharePercent(0.346)).toBe('35%');
    expect(sharePercent(1)).toBe('100%');
  });
});

describe('categoryRows', () => {
  const spending: CategorySummaryView['spending'] = [
    {
      categoryId: 'food',
      amount: money(700),
      children: [
        { categoryId: 'pantry', amount: money(400) },
        { categoryId: 'takeaway', amount: money(200) },
        { categoryId: 'food', amount: money(100) },
      ],
    },
    { categoryId: 'rent', amount: money(300), children: [] },
    { categoryId: null, amount: money(0), children: [] },
  ];

  it('lists parents, children and flat rows in the server order', () => {
    const rows = categoryRows(
      summary(spending),
      money(1000),
      categories,
      new Map(),
    );
    expect(rows.map((r) => [r.key, r.role])).toEqual([
      ['food', 'parent'],
      ['food/pantry', 'child'],
      ['food/takeaway', 'child'],
      ['food/food', 'last-child'],
      ['rent', 'flat'],
      ['none', 'flat'],
    ]);
    expect(rows[0]?.fraction).toBeCloseTo(0.7);
    expect(rows[3]?.name).toBe('food itself');
  });

  it('treats a group whose only child is itself as flat', () => {
    const rows = categoryRows(
      summary([
        {
          categoryId: 'rent',
          amount: money(300),
          children: [{ categoryId: 'rent', amount: money(300) }],
        },
      ]),
      money(300),
      categories,
      new Map(),
    );
    expect(rows.map((r) => r.role)).toEqual(['flat']);
  });

  it('flags a category over its budget and ignores other currencies', () => {
    const rows = categoryRows(
      summary(spending),
      money(1000),
      categories,
      new Map([
        ['food', money(600)],
        ['rent', money(300, 'EUR')],
      ]),
    );
    expect(rows.find((r) => r.key === 'food')?.over).toBe(true);
    expect(rows.find((r) => r.key === 'rent')?.over).toBe(false);
    expect(rows.find((r) => r.key === 'rent')?.budget).toEqual(
      money(300, 'EUR'),
    );
  });

  it('folds children away and builds the share bar from top levels', () => {
    const rows = categoryRows(
      summary(spending),
      money(1000),
      categories,
      new Map(),
    );
    expect(visibleRows(rows, new Set(['food'])).map((r) => r.key)).toEqual([
      'food',
      'rent',
      'none',
    ]);
    expect(shareSegments(rows).map((s) => s.id)).toEqual(['food', 'rent']);
  });
});

describe('budgetsByCategory', () => {
  const budgets = [
    { target: { kind: 'category', categoryId: 'food' }, planned: money(600) },
    { target: { kind: 'buffer' }, planned: money(50) },
  ] as BudgetView[];

  it('only lines up with the current period of the same rule', () => {
    expect(budgetsByCategory(budgets, 'cycle', 'cycle').get('food')).toEqual(
      money(600),
    );
    expect(budgetsByCategory(budgets, 'cycle', 'month').size).toBe(0);
    expect(budgetsByCategory(budgets, 'last-cycle', 'cycle').size).toBe(0);
    expect(budgetsByCategory(budgets, 'month', 'month').size).toBe(1);
  });
});

describe('dayChart', () => {
  const day = (
    date: string,
    spent: number | null,
    allowance: number | null,
  ): CycleDayView => ({
    date: localDate(date),
    spent: spent === null ? null : money(spent),
    cumulativeSpent: null,
    pace: money(0),
    availableEnd: null,
    allowance: allowance === null ? null : money(allowance),
  });

  it('marks days over their allowance and skips days after today', () => {
    const figures = cycleDayFigures([
      day('2026-10-01', 500, 400),
      day('2026-10-02', 100, 400),
      day('2026-10-03', null, null),
    ]);
    const chart = dayChart(figures, 'en');
    expect(chart.overCount).toBe(1);
    expect(chart.columns.map((c) => c.id)).toEqual([
      '2026-10-01',
      '2026-10-02',
    ]);
    expect(chart.columns[0]?.color).toBe('negative');
    expect(chart.columns[1]?.color).toBeUndefined();
    expect(chart.columns[0]?.fraction).toBe(1);
    expect(chart.columns[1]?.fraction).toBeCloseTo(0.2);
    expect(chart.columns[1]?.xLabel).toBe('2');
    expect(chart.rows).toHaveLength(2);
  });

  it('labels only the peak and over days when there are many', () => {
    const days = Array.from({ length: 20 }, (_, i) =>
      day(`2026-10-${String(i + 1).padStart(2, '0')}`, 100 + i, 10_000),
    );
    const chart = dayChart(cycleDayFigures(days), 'en');
    expect(chart.columns.filter((c) => c.valueLabel !== '')).toHaveLength(1);
    expect(chart.columns.at(-1)?.valueLabel).not.toBe('');
  });

  it('draws nothing for no days', () => {
    expect(dayChart([], 'en').columns).toEqual([]);
  });
});
