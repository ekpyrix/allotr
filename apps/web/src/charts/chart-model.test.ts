import { describe, expect, it } from 'vitest';
import { domainOf, lineGeometry, toPercent, toPlot } from './chart-model.ts';

describe('chart model', () => {
  it('widens the domain to include extra values', () => {
    expect(domainOf([2, 5], [0])).toEqual([0, 5]);
    expect(domainOf([])).toEqual([0, 1]);
  });

  it('flips y so larger values sit higher', () => {
    expect(toPercent(0, [0, 10], 'y')).toBe(100);
    expect(toPercent(10, [0, 10], 'y')).toBe(0);
    expect(toPercent(5, [0, 10], 'x')).toBe(50);
  });

  it('maps a point into plot space', () => {
    expect(toPlot({ x: 1, y: 5 }, [0, 2], [0, 10])).toEqual({ x: 50, y: 50 });
  });

  it('gives the last point by x as the end', () => {
    const g = lineGeometry(
      [
        { x: 2, y: 10 },
        { x: 0, y: 0 },
      ],
      [0, 2],
      [0, 10],
    );
    expect(g.end).toEqual({ x: 100, y: 0 });
    expect(g.area.endsWith('Z')).toBe(true);
  });

  it('draws nothing for one point', () => {
    expect(lineGeometry([{ x: 1, y: 1 }], [0, 2], [0, 2]).line).toBe('');
  });
});
