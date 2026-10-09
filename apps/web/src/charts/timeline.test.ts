import { describe, expect, it } from 'vitest';
import { anchorOf, tickDays } from './timeline.tsx';

describe('tickDays', () => {
  it('starts at day 0 and ends on the last day', () => {
    const ticks = tickDays(30);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBe(29);
  });

  it('drops a tick that crowds the last one', () => {
    expect(tickDays(30)).toEqual([0, 7, 14, 21, 29]);
    expect(tickDays(29)).toEqual([0, 7, 14, 21, 28]);
  });

  it('handles tiny cycles', () => {
    expect(tickDays(0)).toEqual([]);
    expect(tickDays(1)).toEqual([0]);
  });
});

describe('anchorOf', () => {
  it('grows the first and last day inwards and centres the rest', () => {
    expect(anchorOf(0, 30)).toBe('start');
    expect(anchorOf(14, 30)).toBe('mid');
    expect(anchorOf(29, 30)).toBe('end');
  });

  it('anchors a one-day cycle at the start', () => {
    expect(anchorOf(0, 1)).toBe('start');
  });
});
