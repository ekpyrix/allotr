import { describe, expect, it } from 'vitest';
import { detentOffset, settleDrag } from './sheet.tsx';

// A made-up 800 px tall screen: the sheet is 736 px, resting 336 px down
// at the medium detent and at 0 when large.
const height = 800;

describe('detentOffset', () => {
  it('rests the large detent at the top and medium halfway', () => {
    expect(detentOffset('large', height)).toBe(0);
    expect(detentOffset('medium', height)).toBe(336);
  });
});

describe('settleDrag', () => {
  const both = ['medium', 'large'] as const;

  it('snaps to the detent the drag was heading for', () => {
    expect(settleDrag(both, 'medium', 150, -200, height)).toBe('large');
    expect(settleDrag(both, 'large', 200, 300, height)).toBe('medium');
    expect(settleDrag(both, 'medium', 330, 0, height)).toBe('medium');
  });

  it('dismisses past 30 % of the open height', () => {
    // Medium shows 400 px; 30 % is 120 px below its rest.
    expect(settleDrag(both, 'medium', 336 + 121, 0, height)).toBeNull();
    expect(settleDrag(both, 'medium', 336 + 119, 0, height)).toBe('medium');
  });

  it('dismisses on a fast downward flick', () => {
    expect(settleDrag(both, 'large', 20, 801, height)).toBeNull();
  });

  it('keeps to the detents it is given', () => {
    expect(settleDrag(['large'], 'large', 200, 300, height)).toBe('large');
  });
});
