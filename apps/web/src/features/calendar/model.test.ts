import { localDate } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { leadingBlanks, monthRange, shiftMonth } from './model.ts';

describe('calendar model', () => {
  it('spans a month', () => {
    expect(monthRange('2026-02')).toEqual({
      month: '2026-02',
      from: '2026-02-01',
      to: '2026-02-28',
    });
  });

  it('moves a month either way across a year end', () => {
    const december = monthRange('2026-12');
    expect(shiftMonth(december, 1).month).toBe('2027-01');
    expect(shiftMonth(monthRange('2027-01'), -1).month).toBe('2026-12');
    expect(shiftMonth(monthRange('2026-03'), -1).to).toBe('2026-02-28');
  });

  it('counts blank cells before a Monday-first week', () => {
    // 1 Oct 2026 is a Thursday; 1 Jun 2026 a Monday; 1 Nov 2026 a Sunday.
    expect(leadingBlanks(localDate('2026-10-01'))).toBe(3);
    expect(leadingBlanks(localDate('2026-06-01'))).toBe(0);
    expect(leadingBlanks(localDate('2026-11-01'))).toBe(6);
  });
});
