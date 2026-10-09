import { localDate, type CalendarDayView } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { dayMarks, heatBackground, heatPercent } from './calendar-grid.tsx';

const base = {
  date: localDate('2026-10-09'),
  spent: null,
  heat: null,
  bills: [],
  payday: false,
  ious: [],
} as unknown as CalendarDayView;

describe('heatPercent', () => {
  it('runs from 0 to 55 percent', () => {
    expect([0, 1, 2, 3, 4].map(heatPercent)).toEqual([
      0, 13.75, 27.5, 41.25, 55,
    ]);
  });
  it('treats no data as none and clamps', () => {
    expect(heatPercent(null)).toBe(0);
    expect(heatPercent(9)).toBe(55);
    expect(heatPercent(-3)).toBe(0);
  });
});

describe('heatBackground', () => {
  it('is an opaque mix into the canvas', () => {
    const css = heatBackground(4);
    expect(css).toContain('color-mix');
    expect(css).toContain('var(--canvas)');
    expect(css).not.toMatch(/rgba|opacity|transparent/);
  });
});

describe('dayMarks', () => {
  it('lists b, i and $ in that order', () => {
    expect(dayMarks(base)).toEqual([]);
    const busy = {
      ...base,
      bills: [{}],
      ious: [{}],
      payday: true,
    } as unknown as CalendarDayView;
    expect(dayMarks(busy)).toEqual(['b', 'i', '$']);
  });
});
