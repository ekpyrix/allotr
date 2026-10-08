import { describe, expect, it } from 'vitest';
import {
  overflows,
  scrollTopFromThumb,
  thumbOffset,
  thumbSize,
} from './overlay-scrollbar-math.ts';

describe('overlay scrollbar maths', () => {
  it('needs no thumb when the content fits', () => {
    expect(overflows(400, 400)).toBe(false);
    expect(thumbSize(400, 300)).toBe(400);
    expect(thumbOffset(400, 300, 0)).toBe(0);
  });

  it('sizes the thumb by the visible share, with a floor', () => {
    expect(thumbSize(400, 800)).toBe(200);
    expect(thumbSize(400, 400_000)).toBe(24);
  });

  it('puts the thumb at the ends for the ends of the scroll range', () => {
    expect(thumbOffset(400, 800, 0)).toBe(0);
    expect(thumbOffset(400, 800, 400)).toBe(200);
    expect(thumbOffset(400, 800, 9999)).toBe(200);
  });

  it('maps a thumb offset back to scrollTop', () => {
    expect(scrollTopFromThumb(400, 800, 100)).toBe(200);
    expect(scrollTopFromThumb(400, 800, -5)).toBe(0);
    expect(scrollTopFromThumb(400, 800, 999)).toBe(400);
    expect(scrollTopFromThumb(400, 300, 50)).toBe(0);
  });

  it('round-trips', () => {
    for (const top of [0, 37, 150, 400]) {
      expect(
        scrollTopFromThumb(400, 800, thumbOffset(400, 800, top)),
      ).toBeCloseTo(top);
    }
  });
});
