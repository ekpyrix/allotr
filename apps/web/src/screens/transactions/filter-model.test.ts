import type { CategoryView } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { categoryTree } from '@/features/settings/categories-model';
import {
  applyFilterKeys,
  filterKeys,
  categoryChips,
  removeCategory,
  toggleCategory,
} from './filter-model.ts';

const cat = (
  id: string,
  name: string,
  parentId: string | null = null,
  position = 0,
) =>
  ({
    id,
    name,
    parentId,
    kind: 'expense',
    mergedIntoId: null,
    position,
  }) as unknown as CategoryView;

const categories = [
  cat('food', 'Food'),
  cat('cafe', 'Cafés', 'food', 0),
  cat('shop', 'Groceries', 'food', 1),
  cat('fun', 'Fun', null, 1),
];
const tree = categoryTree(categories).expense;

describe('toggleCategory', () => {
  it('a parent sets and clears all its children', () => {
    const on = toggleCategory([], tree, 'food');
    expect(new Set(on)).toEqual(new Set(['food', 'cafe', 'shop']));
    expect(toggleCategory(on, tree, 'food')).toEqual([]);
  });

  it('keeps the parent in step with its children', () => {
    const one = toggleCategory([], tree, 'cafe');
    expect(one).toEqual(['cafe']);
    const both = toggleCategory(one, tree, 'shop');
    expect(new Set(both)).toEqual(new Set(['cafe', 'shop', 'food']));
    expect(new Set(toggleCategory(both, tree, 'cafe'))).toEqual(
      new Set(['shop']),
    );
  });

  it('toggles a category with no children on its own', () => {
    expect(toggleCategory(['food'], tree, 'fun')).toEqual(['food', 'fun']);
    expect(toggleCategory(['food', 'fun'], tree, 'fun')).toEqual(['food']);
  });
});

describe('chips', () => {
  it('one chip stands for a parent and its children', () => {
    const selected = toggleCategory(['fun'], tree, 'food');
    expect(categoryChips(selected, categories).map((c) => c.label)).toEqual([
      'Fun',
      'Food',
    ]);
  });

  it('removing a parent removes its children', () => {
    const selected = toggleCategory(['fun'], tree, 'food');
    expect(removeCategory(selected, categories, 'food')).toEqual(['fun']);
  });
});

describe('applyFilterKeys', () => {
  const none = { type: undefined, categories: [], accounts: [] };

  it('treats the type section as radio buttons', () => {
    const first = applyFilterKeys(none, new Set(['type:expense']), tree);
    expect(first.type).toBe('expense');
    const second = applyFilterKeys(
      first,
      new Set(['type:expense', 'type:income']),
      tree,
    );
    expect(second.type).toBe('income');
    expect(applyFilterKeys(second, new Set(), tree).type).toBeUndefined();
  });

  it('routes category keys through the parent rules', () => {
    const next = applyFilterKeys(none, new Set(['category:food']), tree);
    expect(new Set(next.categories)).toEqual(new Set(['food', 'cafe', 'shop']));
    const parentOff = applyFilterKeys(
      next,
      new Set(['category:cafe', 'category:shop']),
      tree,
    );
    expect(parentOff.categories).toEqual([]);
    const childOff = applyFilterKeys(
      next,
      new Set(['category:food', 'category:shop']),
      tree,
    );
    expect(childOff.categories).toEqual(['shop']);
  });

  it('adds and removes accounts', () => {
    const on = applyFilterKeys(none, new Set(['account:a1']), tree);
    expect(on.accounts).toEqual(['a1']);
    expect(filterKeys(on)).toEqual(new Set(['account:a1']));
    expect(applyFilterKeys(on, new Set(), tree).accounts).toEqual([]);
  });
});
