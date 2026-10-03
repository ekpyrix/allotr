import { localDate, type CategoryView } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { categoryName, categoryNames, formatRange } from './format.ts';

function category(
  id: string,
  name: string,
  parentId: string | null = null,
): CategoryView {
  return {
    id,
    name,
    kind: 'expense',
    parentId,
    isPaycheck: false,
    position: 0,
    colour: null,
    icon: null,
    mergedIntoId: null,
  };
}

describe('formatRange', () => {
  // Intl puts thin spaces around the dash.
  const range = (from: string, to: string) =>
    formatRange(localDate(from), localDate(to), 'en-US').replace(/\s/gu, ' ');

  it('shows two days as one range, never shifted by the time zone', () => {
    expect(range('2026-03-01', '2026-03-24')).toBe('Mar 1 – 24, 2026');
    expect(range('2026-12-25', '2027-01-24')).toBe(
      'Dec 25, 2026 – Jan 24, 2027',
    );
  });
});

describe('categoryNames', () => {
  const names = categoryNames([
    category('food', 'Food'),
    category('groceries', 'Groceries', 'food'),
  ]);

  it('names a subcategory with its parent', () => {
    expect(categoryName(names, 'food')).toBe('Food');
    expect(categoryName(names, 'groceries')).toBe('Food › Groceries');
  });

  it('has a label for money without a category', () => {
    expect(categoryName(names, null)).toBe('No category');
    expect(categoryName(names, 'gone')).toBe('No category');
  });
});
