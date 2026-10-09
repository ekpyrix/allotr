import { money, type BudgetView, type CategoryView } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { budgetRows } from './budgets.ts';

const m = (n: number) => money(n, 'USD');
const budget = (over: Partial<BudgetView>): BudgetView =>
  ({
    id: 'b1',
    name: 'Food',
    target: { kind: 'category', categoryId: 'c1' },
    spent: m(300),
    left: m(700),
    overflow: m(0),
    ...over,
  }) as BudgetView;
const category = {
  id: 'c1',
  name: 'Food',
  parentId: null,
  colour: 'series-3',
  icon: 'beer',
} as CategoryView;

describe('budgetRows', () => {
  it('sizes the bar from spent against what it had', () => {
    const [row] = budgetRows([budget({})], [category]);
    expect(row?.fraction).toBeCloseTo(0.3);
    expect(row?.over).toBe(false);
    expect(row?.icon).toBe('beer');
    expect(row?.colour).toBe(3);
  });
  it('marks overflow and falls back for the buffer', () => {
    const [row] = budgetRows(
      [
        budget({
          target: { kind: 'buffer' },
          overflow: m(50),
          spent: m(100),
          left: m(0),
        }),
      ],
      [category],
    );
    expect(row?.over).toBe(true);
    expect(row?.fraction).toBe(1);
    expect(row?.icon).toBeNull();
  });
});
