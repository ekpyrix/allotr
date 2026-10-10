import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { CycleSummaryView } from '@allotr/shared';
import {
  cycleRows,
  formatRate,
  fractionsOf,
  recentCycles,
  savedColumns,
  spentColumns,
} from './cycles-model.ts';

const usd = (amountMinor: number) =>
  ({ amountMinor, currency: 'USD' }) as CycleSummaryView['income'];

function cycle(
  openedOn: string,
  over: Partial<CycleSummaryView> = {},
): CycleSummaryView {
  return {
    openedOn,
    openedBy: null,
    closedOn: '2026-10-01',
    lastDay: '2026-09-30',
    payday: openedOn,
    income: usd(300_000),
    spending: usd(120_000),
    leftover: usd(0),
    savingsNetChange: usd(30_000),
    savingsRate: 1000,
    offBudgetClosing: usd(500_000),
    amended: false,
    missingRates: [],
    ...over,
  } as CycleSummaryView;
}

describe('recentCycles', () => {
  it('keeps the newest and puts the oldest first', () => {
    const list = ['d', 'c', 'b', 'a'].map((d) => cycle(`2026-0${d}-01`));
    expect(recentCycles(list, 2).map((c) => c.openedOn)).toEqual([
      '2026-0c-01',
      '2026-0d-01',
    ]);
  });
});

describe('fractionsOf', () => {
  it('sizes against the tallest', () => {
    expect(fractionsOf([50, 100, 25])).toEqual([0.5, 1, 0.25]);
  });
  it('gives losses and empty series no height', () => {
    expect(fractionsOf([-5, 10])).toEqual([0, 1]);
    expect(fractionsOf([0, -3])).toEqual([0, 0]);
    expect(fractionsOf([])).toEqual([]);
  });
  it('stays within 0..1 and keeps order', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -1_000_000, max: 1_000_000 })),
        (values) => {
          const out = fractionsOf(values);
          expect(out).toHaveLength(values.length);
          out.forEach((f, i) => {
            expect(f).toBeGreaterThanOrEqual(0);
            expect(f).toBeLessThanOrEqual(1);
            const v = values[i] ?? 0;
            if (v <= 0) expect(f).toBe(0);
          });
          if (values.some((v) => v > 0)) expect(Math.max(...out)).toBe(1);
        },
      ),
    );
  });
});

describe('formatRate', () => {
  it('writes basis points as integer text', () => {
    expect(formatRate(1550)).toBe('15.5%');
    expect(formatRate(1000)).toBe('10%');
    expect(formatRate(-500)).toBe('-5%');
    expect(formatRate(1205)).toBe('12.05%');
    expect(formatRate(0)).toBe('0%');
  });
});

describe('columns', () => {
  const list = [
    cycle('2026-08-01', { spending: usd(200_000) }),
    cycle('2026-09-01', {
      spending: usd(100_000),
      savingsNetChange: usd(-1_000),
    }),
  ];
  it('labels the spent columns with the server amounts', () => {
    const cols = spentColumns(list, 'en');
    expect(cols.map((c) => c.fraction)).toEqual([1, 0.5]);
    expect(cols[0]?.valueLabel).toBe('$2k');
    expect(cols[0]?.id).toBe('2026-08-01');
  });
  it('gives a loss no bar', () => {
    expect(savedColumns(list, 'en').map((c) => c.fraction)).toEqual([1, 0]);
  });
});

describe('cycleRows', () => {
  it('names the open cycle and carries the rate and amendment', () => {
    const rows = cycleRows(
      [
        cycle('2026-10-01', {
          closedOn: null,
          savingsRate: null,
          amended: true,
        }),
        cycle('2026-09-01'),
      ],
      'en',
    );
    expect(rows[0]).toMatchObject({
      label: 'This cycle',
      rate: null,
      amended: true,
    });
    expect(rows[1]?.rate).toBe('10%');
    expect(rows[1]?.label).toContain('Sep');
    expect(rows[1]?.spent).toEqual(usd(120_000));
  });
});
