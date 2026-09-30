import { localDate, money, type CycleDayView } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { heroState, paceAhead, todayRow } from './state.ts';

const usd = (amountMinor: number) => money(amountMinor, 'USD');
const figures = (left: number, allowance = 4000) => ({
  leftToday: usd(left),
  todayAllowance: usd(allowance),
});

describe('heroState', () => {
  it('is over once today is overspent', () => {
    expect(heroState(figures(-1), false)).toBe('over');
  });

  it('is tight at a quarter of the allowance or less', () => {
    expect(heroState(figures(999), false)).toBe('tight');
    expect(heroState(figures(1000), false)).toBe('ok');
    expect(heroState(figures(0, 0), false)).toBe('tight');
  });

  it('is tight when spending runs ahead of pace', () => {
    expect(heroState(figures(3000), true)).toBe('tight');
  });

  it('is ok otherwise', () => {
    expect(heroState(figures(4000), false)).toBe('ok');
  });
});

const day = (
  date: string,
  cumulative: number | null,
  pace: number,
): CycleDayView => ({
  date: localDate(date),
  spent: cumulative === null ? null : usd(0),
  cumulativeSpent: cumulative === null ? null : usd(cumulative),
  pace: usd(pace),
  availableEnd: cumulative === null ? null : usd(0),
  allowance: cumulative === null ? null : usd(0),
});

describe('pace', () => {
  const days = [
    day('2026-04-01', 500, 1000),
    day('2026-04-02', 2500, 2000),
    day('2026-04-03', null, 3000),
  ];

  it("finds today's row: the last with figures", () => {
    expect(todayRow(days)?.date).toBe('2026-04-02');
  });

  it('is ahead when spending passes the even pace', () => {
    expect(paceAhead(days)).toBe(true);
    expect(paceAhead(days.slice(0, 1))).toBe(false);
    expect(paceAhead([])).toBe(false);
  });
});
