import { describe, expect, it, vi } from 'vitest';
import { REVEAL, settleSwipe, type SwipeAction } from './swipe-row.tsx';

const action = (
  label: string,
  extra: Partial<SwipeAction> = {},
): SwipeAction => ({
  label,
  icon: null,
  onAction: vi.fn(),
  ...extra,
});

const edit = action('Edit');
const reverse = action('Reverse', { tone: 'danger' });
const duplicate = action('Duplicate', { commitOnFullSwipe: true });

describe('settleSwipe', () => {
  it('springs back below the reveal threshold', () => {
    expect(
      settleSwipe(-(REVEAL - 1), 360, [duplicate], [edit, reverse]),
    ).toEqual({
      offset: 0,
    });
  });

  it('holds the actions open past it', () => {
    expect(settleSwipe(-100, 360, [duplicate], [edit, reverse])).toEqual({
      offset: -144,
    });
    expect(settleSwipe(100, 360, [duplicate], [edit, reverse])).toEqual({
      offset: 72,
    });
  });

  it('commits a full swipe only for an action that allows it', () => {
    expect(settleSwipe(200, 360, [duplicate], [edit, reverse])).toEqual({
      offset: 0,
      commit: duplicate,
    });
    // Reverse is destructive and never commits on a full swipe.
    expect(settleSwipe(-200, 360, [duplicate], [edit, reverse])).toEqual({
      offset: -144,
    });
  });

  it('does nothing on a side without actions', () => {
    expect(settleSwipe(120, 360, [], [edit])).toEqual({ offset: 0 });
  });
});
