import { localDate, money } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { netWorthChart } from './net-worth-model.ts';

const day = (i: number, minor: number) => ({
  date: localDate(`2026-03-${String(i + 1).padStart(2, '0')}`),
  amount: money(minor, 'USD'),
});

describe('netWorthChart', () => {
  it('plots one point per day with the lowest and highest as y ticks', () => {
    const chart = netWorthChart(
      [day(0, 1000), day(1, 400), day(2, 2500), day(3, 2000), day(4, 2200)],
      'en',
    );
    expect(chart.points.map((p) => p.y)).toEqual([1000, 400, 2500, 2000, 2200]);
    expect(chart.yTicks.map((t) => t.value)).toEqual([400, 2500]);
    expect(chart.xTicks.map((t) => t.value)).toEqual([0, 2, 4]);
  });

  it('copes with one point and with none', () => {
    expect(netWorthChart([day(0, 5)], 'en').xTicks).toHaveLength(1);
    expect(netWorthChart([day(0, 5)], 'en').yTicks).toHaveLength(1);
    expect(netWorthChart([], 'en')).toEqual({
      points: [],
      yTicks: [],
      xTicks: [],
    });
  });
});
