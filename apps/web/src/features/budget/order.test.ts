import { describe, expect, it } from 'vitest';
import { moveItem } from './order.ts';

describe('moveItem', () => {
  const list = ['free', 'buffer', 'food', 'travel'];

  it('moves an item down and up', () => {
    expect(moveItem(list, 1, 3)).toEqual(['free', 'food', 'travel', 'buffer']);
    expect(moveItem(list, 3, 0)).toEqual(['travel', 'free', 'buffer', 'food']);
  });

  it('leaves the list alone for a move that goes nowhere', () => {
    expect(moveItem(list, 0, -1)).toEqual(list);
    expect(moveItem(list, 3, 4)).toEqual(list);
    expect(moveItem(list, 2, 2)).toEqual(list);
    expect(moveItem(list, 9, 0)).toEqual(list);
  });

  it('does not change its input', () => {
    const copy = [...list];
    moveItem(list, 0, 2);
    expect(list).toEqual(copy);
  });
});
