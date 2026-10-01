import type { CategoryView } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import {
  categoryPath,
  categoryTree,
  mergeTargets,
} from './categories-model.ts';

function category(
  id: string,
  name: string,
  patch: Partial<CategoryView> = {},
): CategoryView {
  return {
    id,
    name,
    kind: 'expense',
    parentId: null,
    isPaycheck: false,
    position: 0,
    colour: null,
    icon: null,
    mergedIntoId: null,
    ...patch,
  };
}

const food = category('food', 'Food', { position: 1 });
const coffee = category('coffee', 'Coffee', { parentId: 'food' });
const rent = category('rent', 'Rent', { position: 0 });
const old = category('old', 'Old', { mergedIntoId: 'rent' });
const salary = category('salary', 'Salary', { kind: 'income' });
const all = [food, coffee, rent, old, salary];

describe('categoryTree', () => {
  it('groups by kind, orders by position and nests subcategories', () => {
    const tree = categoryTree(all);
    expect(tree.expense.map((n) => n.category.name)).toEqual(['Rent', 'Food']);
    expect(tree.expense[1]?.children.map((c) => c.name)).toEqual(['Coffee']);
    expect(tree.income.map((n) => n.category.name)).toEqual(['Salary']);
    expect(tree.transfer).toEqual([]);
  });

  it('leaves out merged categories', () => {
    const names = categoryTree(all).expense.map((n) => n.category.name);
    expect(names).not.toContain('Old');
  });
});

describe('categoryPath', () => {
  it('names a subcategory with its parent', () => {
    expect(categoryPath(coffee, all)).toBe('Food / Coffee');
    expect(categoryPath(food, all)).toBe('Food');
  });
});

describe('mergeTargets', () => {
  it('offers other active categories of the same kind', () => {
    expect(mergeTargets(rent, all)).toEqual([
      { id: 'food', label: 'Food' },
      { id: 'coffee', label: 'Food / Coffee' },
    ]);
    expect(mergeTargets(salary, all)).toEqual([]);
  });
});
