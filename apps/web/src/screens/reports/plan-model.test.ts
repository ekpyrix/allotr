import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { BudgetView, CycleSummaryView, LocalDate } from '@allotr/shared';
import {
  MAX_WORTH_DAYS,
  MIN_WORTH_DAYS,
  budgetRows,
  rateColumns,
  worthDays,
} from './plan-model.ts';

const usd = (amountMinor: number) =>
  ({ amountMinor, currency: 'USD' }) as BudgetView['left'];

function budget(
  id: string,
  spent: number,
  left: number,
  overflow = 0,
): BudgetView {
  return {
    id,
    name: id,
    planned: usd(spent + left),
    spent: usd(spent),
    left: usd(left),
    overflow: usd(overflow),
  } as BudgetView;
}

const day = (s: string) => s as LocalDate;

describe('budgetRows', () => {
  it('sizes each bar from spent against what it had', () => {
    const rows = budgetRows([
      budget('food', 25_000, 75_000),
      budget('fun', 12_000, -2_000, 2_000),
      budget('idle', 0, 5_000),
    ]);
    expect(rows.map((r) => r.fraction)).toEqual([0.25, 1, 0]);
    expect(rows.map((r) => r.over)).toEqual([false, true, false]);
    expect(rows[0]?.budget.spent).toEqual(usd(25_000));
  });
});

describe('rateColumns', () => {
  it('shows the server rate and no bar without income', () => {
    const cycles = [
      { openedOn: '2026-08-01', savingsRate: 2000 },
      { openedOn: '2026-09-01', savingsRate: 500 },
      { openedOn: '2026-10-01', savingsRate: null },
      { openedOn: '2026-11-01', savingsRate: -300 },
    ] as CycleSummaryView[];
    const cols = rateColumns(cycles, 'en');
    expect(cols.map((c) => c.valueLabel)).toEqual(['20%', '5%', '–', '-3%']);
    expect(cols.map((c) => c.fraction)).toEqual([1, 0.25, 0, 0]);
  });
});

describe('worthDays', () => {
  it('counts the period start through today', () => {
    expect(worthDays(day('2026-10-01'), day('2026-10-30'))).toBe(30);
    expect(worthDays(day('2026-09-01'), day('2026-10-10'))).toBe(40);
  });
  it('stays within what the API allows', () => {
    expect(worthDays(day('2026-10-10'), day('2026-10-10'))).toBe(
      MIN_WORTH_DAYS,
    );
    expect(worthDays(undefined, day('2026-10-10'))).toBe(MAX_WORTH_DAYS);
    expect(worthDays(day('2000-01-01'), day('2026-10-10'))).toBe(
      MAX_WORTH_DAYS,
    );
  });
  it('is always a valid day count', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20_000 }),
        fc.integer({ min: 0, max: 20_000 }),
        (a, b) => {
          const iso = (n: number) =>
            new Date(Date.UTC(2000, 0, 1) + n * 86_400_000)
              .toISOString()
              .slice(0, 10) as LocalDate;
          const n = worthDays(iso(a), iso(b));
          expect(Number.isInteger(n)).toBe(true);
          expect(n).toBeGreaterThanOrEqual(MIN_WORTH_DAYS);
          expect(n).toBeLessThanOrEqual(MAX_WORTH_DAYS);
        },
      ),
    );
  });
});
