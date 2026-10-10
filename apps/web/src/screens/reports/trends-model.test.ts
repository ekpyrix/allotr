import { money as sharedMoney } from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { CategorySeriesView, CategoryView, Money } from '@allotr/shared';
import {
  hasSpending,
  periodLabels,
  tickIndexes,
  totalsColumns,
  trendLines,
  versusRows,
} from './trends-model.ts';

const money = (amountMinor: number): Money => sharedMoney(amountMinor, 'USD');

const category = (id: string): CategoryView => ({
  id,
  name: id,
  kind: 'expense',
  parentId: null,
  isPaycheck: false,
  position: 0,
  colour: null,
  icon: null,
  mergedIntoId: null,
});
const categories = [category('food'), category('rent'), category('fun')];

const series = {
  periods: [
    { from: '2026-08-01', to: '2026-08-31' },
    { from: '2026-09-01', to: '2026-09-30' },
    { from: '2026-10-01', to: '2026-10-31' },
  ],
  groups: [
    { categoryId: 'rent', points: [money(900), money(900), money(900)] },
    { categoryId: 'food', points: [money(300), money(500), money(400)] },
    { categoryId: 'fun', points: [money(0), money(0), money(0)] },
    { categoryId: null, points: [money(0), money(20), money(50)] },
  ],
  totals: [money(1200), money(1420), money(1350)],
  missingRates: [],
} as unknown as CategorySeriesView;

describe('trendLines', () => {
  it('draws the largest categories with one point per period', () => {
    const lines = trendLines(series, categories, 'en', 2);
    expect(lines.series.map((s) => s.id)).toEqual(['rent', 'food']);
    expect(lines.series[1]?.points).toEqual([
      { x: 0, y: 300 },
      { x: 1, y: 500 },
      { x: 2, y: 400 },
    ]);
    expect(lines.xTicks.map((t) => t.label)).toEqual([
      'Aug 1',
      'Sep 1',
      'Oct 1',
    ]);
    expect(lines.table.headers).toEqual(['Period', 'rent', 'food']);
    expect(lines.table.rows[0]).toEqual(['Aug 1', '$9.00', '$3.00']);
  });

  it('covers the data with its y ticks', () => {
    const lines = trendLines(series, categories, 'en');
    const top = Math.max(...lines.yTicks.map((t) => t.value));
    expect(top).toBeGreaterThanOrEqual(900);
    expect(lines.yTicks[0]?.value).toBe(0);
  });

  it('gives a category with no id its own name', () => {
    const lines = trendLines(series, categories, 'en', 10);
    expect(lines.series.find((s) => s.id === 'none')?.label).toBe(
      'No category',
    );
  });
});

describe('versusRows', () => {
  it('compares the last period with the one before, by comparison only', () => {
    const rows = versusRows(series, categories);
    expect(rows.map((r) => [r.key, r.movement])).toEqual([
      ['rent', 'same'],
      ['food', 'down'],
      ['none', 'up'],
    ]);
    expect(rows[1]?.current).toEqual(money(400));
    expect(rows[1]?.previous).toEqual(money(500));
  });

  it('has no movement with a single period', () => {
    const one = {
      ...series,
      periods: [{ from: '2026-10-01', to: '2026-10-31' }],
      groups: [{ categoryId: 'food', points: [money(400)] }],
      totals: [money(400)],
    } as unknown as CategorySeriesView;
    expect(versusRows(one, categories)[0]).toMatchObject({
      previous: null,
      movement: null,
    });
  });
});

describe('totalsColumns', () => {
  it('scales columns against the tallest and marks the last period', () => {
    const { columns, rows } = totalsColumns(series, 'en');
    expect(columns.map((c) => Math.round(c.fraction * 100))).toEqual([
      85, 100, 95,
    ]);
    expect(columns.map((c) => c.color)).toEqual([
      'series-3',
      'series-3',
      'series-1',
    ]);
    expect(rows[2]).toEqual(['Oct 1', '$13.50']);
  });
});

describe('helpers', () => {
  it('knows when nothing was spent', () => {
    expect(hasSpending(series)).toBe(true);
    expect(hasSpending({ ...series, totals: [money(0), money(0)] })).toBe(
      false,
    );
  });

  it('labels each period by its first day', () => {
    expect(periodLabels(series, 'en')).toEqual(['Aug 1', 'Sep 1', 'Oct 1']);
  });

  it('keeps first and last ticks and never exceeds the maximum', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 60 }),
        fc.integer({ min: 2, max: 10 }),
        (count, max) => {
          const ticks = tickIndexes(count, max);
          expect(ticks.length).toBeLessThanOrEqual(max);
          expect(ticks[0]).toBe(0);
          expect(ticks.at(-1)).toBe(count - 1);
          expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);
        },
      ),
    );
    expect(tickIndexes(0)).toEqual([]);
  });
});
