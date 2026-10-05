import { money, type BudgetView, type CategoryView } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { budgetName, canDelete, countedCategory } from './budget-draft.ts';

const category = (id: string, name: string) => ({ id, name }) as CategoryView;
const categories = [category('c1', 'Groceries'), category('c2', 'Transport')];

const budget = (
  target: BudgetView['target'],
  startedOn = '2026-03-01',
): BudgetView =>
  ({ target, startedOn, amount: money(100, 'USD') }) as BudgetView;

describe('budgetName', () => {
  it('defaults to the chosen category', () => {
    expect(budgetName('', 'c1', categories)).toBe('Groceries');
    expect(budgetName('   ', 'c2', categories)).toBe('Transport');
  });

  it('keeps a custom name', () => {
    expect(budgetName(' Bills ', 'c1', categories)).toBe('Bills');
  });

  it('has no name before a category is chosen', () => {
    expect(budgetName('', '', categories)).toBe('');
  });
});

describe('countedCategory', () => {
  it('names the category a budget counts', () => {
    expect(
      countedCategory({ kind: 'category', categoryId: 'c1' }, categories),
    ).toBe('Groceries');
  });

  it('says nothing for the Buffer or a tag', () => {
    expect(countedCategory({ kind: 'buffer' }, categories)).toBeUndefined();
    expect(
      countedCategory({ kind: 'tag', tagId: 't1' }, categories),
    ).toBeUndefined();
  });
});

describe('canDelete', () => {
  const target = { kind: 'category', categoryId: 'c1' } as const;

  it('allows a budget started in the current period', () => {
    expect(canDelete(budget(target, '2026-03-05'), '2026-03-01')).toBe(true);
    expect(canDelete(budget(target, '2026-03-01'), '2026-03-01')).toBe(true);
  });

  it('refuses one an earlier period used, and the Buffer', () => {
    expect(canDelete(budget(target, '2026-02-10'), '2026-03-01')).toBe(false);
    expect(
      canDelete(budget({ kind: 'buffer' }, '2026-03-05'), '2026-03-01'),
    ).toBe(false);
  });
});
