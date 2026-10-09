import type { LocalDate } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { monthRange, periodRange } from './period.ts';

const d = (s: string) => s as LocalDate;
const cycles = [
  { openedOn: d('2026-09-25'), lastDay: d('2026-10-09') },
  { openedOn: d('2026-08-25'), lastDay: d('2026-09-24') },
];

describe('monthRange', () => {
  it('covers this and last month, leap years included', () => {
    expect(monthRange(d('2026-10-09'), 0)).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
    });
    expect(monthRange(d('2026-01-15'), -1)).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    });
    expect(monthRange(d('2028-03-01'), -1)).toEqual({
      from: '2028-02-01',
      to: '2028-02-29',
    });
  });
});

describe('periodRange', () => {
  it('places each period', () => {
    const today = d('2026-10-09');
    expect(periodRange('all', today, cycles)).toEqual({});
    expect(periodRange('cycle', today, cycles)).toEqual({ from: '2026-09-25' });
    expect(periodRange('last-cycle', today, cycles)).toEqual({
      from: '2026-08-25',
      to: '2026-09-24',
    });
  });

  it('has no last cycle in the first one', () => {
    expect(periodRange('last-cycle', d('2026-10-09'), cycles.slice(0, 1))).toBe(
      null,
    );
  });
});
