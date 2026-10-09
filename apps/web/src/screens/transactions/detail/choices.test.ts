import type { AccountView, CategoryView } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { accountChoicesFor, categoryChoicesFor } from './choices.ts';

const accounts = [
  { id: 'a1', name: 'Everyday', archived: false },
  { id: 'a2', name: 'Old card', archived: true },
  { id: 'a3', name: 'Spare', archived: true },
] as AccountView[];

const cat = (
  id: string,
  name: string,
  parentId: string | null,
  position: number,
  kind: CategoryView['kind'] = 'expense',
) => ({ id, name, parentId, position, kind }) as CategoryView;

describe('accountChoicesFor', () => {
  it('hides archived accounts unless the entry uses them', () => {
    expect(accountChoicesFor(accounts, ['a2']).map((c) => c.id)).toEqual([
      'a1',
      'a2',
    ]);
  });
});

describe('categoryChoicesFor', () => {
  const categories = [
    cat('fun', 'Fun', null, 2),
    cat('food', 'Food', null, 1),
    cat('cafe', 'Cafe', 'food', 1),
    cat('pay', 'Salary', null, 0, 'income'),
  ];

  it('puts children under their parent and keeps the order', () => {
    expect(categoryChoicesFor(categories, 'expense')).toEqual([
      { id: 'food', label: 'Food' },
      { id: 'cafe', label: 'Food › Cafe' },
      { id: 'fun', label: 'Fun' },
    ]);
  });

  it('keeps only the entry kind', () => {
    expect(categoryChoicesFor(categories, 'income')).toEqual([
      { id: 'pay', label: 'Salary' },
    ]);
  });
});
