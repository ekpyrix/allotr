import { categoryColours, type CategoryView } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import {
  categoryStyles,
  colourVar,
  defaultColour,
  seriesNumber,
} from './category-style.ts';

const category = (
  id: string,
  extra: Partial<CategoryView> = {},
): CategoryView => ({
  id,
  name: id,
  kind: 'expense',
  parentId: null,
  isPaycheck: false,
  position: 1,
  colour: null,
  icon: null,
  mergedIntoId: null,
  ...extra,
});

describe('categoryStyles', () => {
  it('uses a category’s own colour and icon', () => {
    const styles = categoryStyles([
      category('food', { colour: 'series-6', icon: 'utensils' }),
    ]);
    expect(styles.get('food')).toEqual({
      colour: 'series-6',
      icon: 'utensils',
    });
  });

  it('lets a subcategory follow its parent, and keep what it set itself', () => {
    const styles = categoryStyles([
      category('food', { colour: 'series-6', icon: 'utensils' }),
      category('groceries', { parentId: 'food' }),
      category('cafes', { parentId: 'food', icon: 'coffee' }),
    ]);
    expect(styles.get('groceries')).toEqual({
      colour: 'series-6',
      icon: 'utensils',
    });
    expect(styles.get('cafes')).toEqual({ colour: 'series-6', icon: 'coffee' });
  });

  it('picks a stable default colour, and no icon', () => {
    const first = categoryStyles([category('misc')]).get('misc');
    const again = categoryStyles([category('misc')]).get('misc');
    expect(first).toEqual(again);
    expect(first?.icon).toBeNull();
    expect(categoryColours).toContain(first?.colour);
  });

  it('gives an unstyled subcategory of an unstyled parent the parent’s default', () => {
    const styles = categoryStyles([
      category('home'),
      category('rent', { parentId: 'home' }),
    ]);
    expect(styles.get('rent')?.colour).toBe(defaultColour('home'));
  });
});

describe('colourVar', () => {
  it('names the theme’s series role', () => {
    expect(colourVar('series-3')).toBe('var(--series-3)');
  });
});

describe('seriesNumber', () => {
  it('reads the index of every series colour', () => {
    expect(categoryColours.map(seriesNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
