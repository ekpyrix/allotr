import { describe, expect, it } from 'vitest';
import type { BudgetView, CategoryView } from '@allotr/shared';
import {
  budgetTree,
  freeCategories,
  subCandidates,
  visibleEntries,
} from './budgets-model.ts';

const money = (amountMinor: number) =>
  ({ amountMinor, currency: 'USD' }) as BudgetView['left'];

function category(
  id: string,
  parentId: string | null,
  position: number,
): CategoryView {
  return {
    id,
    name: id,
    kind: 'expense',
    parentId,
    isPaycheck: false,
    position,
    colour: null,
    icon: null,
    mergedIntoId: null,
  };
}

function budget(id: string, categoryId: string, left = 100): BudgetView {
  return {
    id,
    name: id,
    target: { kind: 'category', categoryId },
    mode: 'daily',
    leftover: 'free',
    startedOn: '2026-10-01',
    amount: money(200),
    planned: money(200),
    carriedIn: money(0),
    spent: money(200 - left),
    left: money(left),
    overflow: money(0),
    coveredOut: money(0),
    restored: money(0),
    held: money(0),
  } as BudgetView;
}

const categories = [
  category('food', null, 1),
  category('groceries', 'food', 1),
  category('dining', 'food', 2),
  category('fun', null, 2),
];

describe('budgetTree', () => {
  it('nests subcategory budgets under a header with no figures', () => {
    const tree = budgetTree(
      [budget('b1', 'groceries'), budget('b2', 'dining'), budget('b3', 'fun')],
      categories,
    );
    expect(tree.map((e) => [e.key, e.role])).toEqual([
      ['food', 'parent'],
      ['b1', 'child'],
      ['b2', 'last-child'],
      ['fun', 'flat'],
    ]);
    expect(tree[0]?.budget).toBeNull();
  });

  it('gives a parent its own budget and fills the bar from spent and left', () => {
    const tree = budgetTree(
      [budget('p', 'food', 50), budget('b1', 'groceries')],
      categories,
    );
    expect(tree[0]?.budget?.id).toBe('p');
    expect(tree[0]?.fraction).toBeCloseTo(0.75);
  });

  it('lists tag and Buffer budgets last', () => {
    const buffer = {
      ...budget('buf', 'x'),
      target: { kind: 'buffer' },
    } as BudgetView;
    const tree = budgetTree([buffer, budget('b3', 'fun')], categories);
    expect(tree.map((e) => e.key)).toEqual(['fun', 'buf']);
  });
});

describe('visibleEntries', () => {
  it('hides the children of a folded parent', () => {
    const tree = budgetTree([budget('b1', 'groceries')], categories);
    expect(visibleEntries(tree, new Set(['food'])).map((e) => e.key)).toEqual([
      'food',
    ]);
  });
});

describe('candidates', () => {
  it('offers subcategories and categories without a budget', () => {
    const budgets = [budget('p', 'food'), budget('b1', 'groceries')];
    expect(
      subCandidates(budgets[0] as BudgetView, budgets, categories),
    ).toEqual([categories[2]]);
    expect(freeCategories(budgets, categories).map((c) => c.id)).toEqual([
      'dining',
      'fun',
    ]);
  });
});
