import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  areaPath,
  columnLayout,
  cubicAt,
  extent,
  linePath,
  linearScale,
  monotoneSegments,
  niceTicks,
  timelineLanes,
} from './math.ts';

const pointsArb = fc
  .array(
    fc.record({
      x: fc.integer({ min: 0, max: 40 }),
      y: fc.integer({ min: -100_000, max: 100_000 }),
    }),
    { maxLength: 24 },
  )
  .map((points) => points);

describe('linearScale', () => {
  it('maps the domain ends to the range ends', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1000, max: 1000 }),
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: -500, max: 500 }),
        fc.integer({ min: 1, max: 500 }),
        (d0, dSpan, r0, rSpan) => {
          const scale = linearScale([d0, d0 + dSpan], [r0, r0 + rSpan]);
          expect(scale(d0)).toBeCloseTo(r0, 9);
          expect(scale(d0 + dSpan)).toBeCloseTo(r0 + rSpan, 9);
        },
      ),
    );
  });

  it('puts a flat domain in the middle of the range', () => {
    const scale = linearScale([5, 5], [0, 100]);
    expect(scale(5)).toBe(50);
    expect(Number.isNaN(scale(9))).toBe(false);
  });

  it('inverts when the range runs backwards', () => {
    expect(linearScale([0, 10], [100, 0])(2)).toBe(80);
  });
});

describe('extent', () => {
  it('is undefined for nothing', () => {
    expect(extent([])).toBeUndefined();
  });
  it('finds the ends', () => {
    expect(extent([3, -2, 9, 0])).toEqual([-2, 9]);
  });
});

describe('niceTicks', () => {
  it('returns whole numbers that cover the data', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 2, max: 8 }),
        (min, span, count) => {
          const ticks = niceTicks(min, min + span, count);
          expect(ticks.length).toBeGreaterThan(0);
          for (const tick of ticks) expect(Number.isInteger(tick)).toBe(true);
          expect(ticks[0]).toBeLessThanOrEqual(min);
          expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(min + span);
          expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);
        },
      ),
    );
  });

  it('gives a flat domain one tick', () => {
    expect(niceTicks(1200, 1200)).toEqual([1200]);
  });

  it('refuses non-finite input', () => {
    expect(niceTicks(Number.NaN, 4)).toEqual([]);
  });

  it('picks round steps', () => {
    expect(niceTicks(0, 100_000, 5)).toEqual([0, 50_000, 100_000]);
    expect(niceTicks(0, 10, 3)).toEqual([0, 5, 10]);
  });
});

describe('monotoneSegments', () => {
  it('draws nothing for fewer than two points', () => {
    expect(monotoneSegments([])).toEqual([]);
    expect(monotoneSegments([{ x: 1, y: 1 }])).toEqual([]);
    expect(linePath([{ x: 1, y: 1 }])).toBe('');
    expect(areaPath([], 0)).toBe('');
  });

  it('joins consecutive points end to end', () => {
    fc.assert(
      fc.property(pointsArb, (points) => {
        const segments = monotoneSegments(points);
        for (let i = 1; i < segments.length; i += 1) {
          expect(segments[i]?.from).toEqual(segments[i - 1]?.to);
        }
      }),
    );
  });

  it('never leaves the two y values of its segment', () => {
    fc.assert(
      fc.property(pointsArb, (points) => {
        for (const segment of monotoneSegments(points)) {
          const low = Math.min(segment.from.y, segment.to.y);
          const high = Math.max(segment.from.y, segment.to.y);
          const slack = 1e-6 * (1 + Math.abs(high - low));
          for (let step = 0; step <= 20; step += 1) {
            const { y } = cubicAt(segment, step / 20);
            expect(y).toBeGreaterThanOrEqual(low - slack);
            expect(y).toBeLessThanOrEqual(high + slack);
          }
        }
      }),
    );
  });

  it('stays inside the data envelope overall', () => {
    fc.assert(
      fc.property(pointsArb, (points) => {
        const range = extent(points.map((p) => p.y));
        if (range === undefined) return;
        for (const segment of monotoneSegments(points)) {
          for (let step = 0; step <= 10; step += 1) {
            const { y } = cubicAt(segment, step / 10);
            expect(y).toBeGreaterThanOrEqual(range[0] - 1e-6);
            expect(y).toBeLessThanOrEqual(range[1] + 1e-6);
          }
        }
      }),
    );
  });

  it('is flat across a flat run and at a local extremum', () => {
    const flat = monotoneSegments([
      { x: 0, y: 5 },
      { x: 1, y: 5 },
      { x: 2, y: 5 },
    ]);
    for (const segment of flat) {
      expect(segment.c1.y).toBe(5);
      expect(segment.c2.y).toBe(5);
    }
    const peak = monotoneSegments([
      { x: 0, y: 0 },
      { x: 1, y: 10 },
      { x: 2, y: 0 },
    ]);
    expect(peak[0]?.c2.y).toBe(10);
    expect(peak[1]?.c1.y).toBe(10);
  });

  it('sorts by x and keeps the last y for a repeated x', () => {
    const segments = monotoneSegments([
      { x: 2, y: 4 },
      { x: 0, y: 0 },
      { x: 2, y: 8 },
    ]);
    expect(segments).toHaveLength(1);
    expect(segments[0]?.to).toEqual({ x: 2, y: 8 });
  });

  it('writes a path that starts at the first point and closes areas', () => {
    const points = [
      { x: 0, y: 10 },
      { x: 50, y: 20 },
      { x: 100, y: 5 },
    ];
    expect(linePath(points).startsWith('M0 10C')).toBe(true);
    expect(areaPath(points, 100).endsWith('L100 100L0 100Z')).toBe(true);
  });
});

describe('columnLayout', () => {
  it('fills the width without overlap', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 40 }),
        fc.integer({ min: 40, max: 400 }),
        fc.integer({ min: 0, max: 5 }),
        (count, total, gap) => {
          const columns = columnLayout(count, total, gap);
          expect(columns).toHaveLength(count);
          for (let i = 0; i < columns.length; i += 1) {
            const column = columns[i];
            if (column === undefined) continue;
            expect(column.x).toBeGreaterThanOrEqual(0);
            expect(column.x + column.width).toBeLessThanOrEqual(total + 1e-9);
            const next = columns[i + 1];
            if (next !== undefined) {
              expect(column.x + column.width).toBeLessThanOrEqual(
                next.x + 1e-9,
              );
            }
          }
        },
      ),
    );
  });

  it('has no columns for none', () => {
    expect(columnLayout(0, 100)).toEqual([]);
  });
});

describe('timelineLanes', () => {
  it('alternates sides and levels in day order', () => {
    const placed = timelineLanes(
      [
        { id: 'c', day: 20 },
        { id: 'a', day: 2 },
        { id: 'd', day: 25 },
        { id: 'b', day: 9 },
        { id: 'e', day: 28 },
      ],
      30,
    );
    expect(placed.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(placed.map((p) => `${p.side}${String(p.level)}`)).toEqual([
      'up0',
      'down0',
      'up1',
      'down1',
      'up0',
    ]);
  });

  it('keeps positions within the axis', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -5, max: 60 }), { maxLength: 12 }),
        fc.integer({ min: 1, max: 31 }),
        (days, length) => {
          const placed = timelineLanes(
            days.map((day, i) => ({ id: String(i), day })),
            length,
          );
          for (const event of placed) {
            expect(event.at).toBeGreaterThanOrEqual(0);
            expect(event.at).toBeLessThanOrEqual(1);
          }
        },
      ),
    );
  });
});
