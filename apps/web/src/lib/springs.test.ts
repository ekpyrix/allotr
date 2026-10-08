import { describe, expect, it } from 'vitest';
import {
  linearEasing,
  settleTime,
  springPosition,
  SPRING_TOKENS,
  SPRINGS,
} from './springs.ts';

describe.each(SPRING_TOKENS)('spring %s', (token) => {
  const spring = SPRINGS[token];
  const { easing, durationMs } = linearEasing(spring);
  const values = /^linear\((.*)\)$/
    .exec(easing)?.[1]
    ?.split(', ')
    .map(Number) ?? [NaN];

  it('writes a valid linear() easing from 0 to 1', () => {
    expect(easing).toMatch(/^linear\((?:-?\d+(?:\.\d+)?, )+1\)$/);
    expect(values[0]).toBe(0);
    expect(values.at(-1)).toBe(1);
  });

  it('settles no sooner than it looks done', () => {
    expect(settleTime(spring)).toBeGreaterThanOrEqual(spring.visualDuration);
    expect(durationMs).toBe(Math.round(settleTime(spring) * 1000));
  });
});

describe('critically damped springs', () => {
  it.each(['snappy', 'smooth', 'gentle'] as const)(
    '%s never overshoots or goes back',
    (token) => {
      let previous = 0;
      for (let ms = 0; ms <= 2000; ms += 5) {
        const x = springPosition(SPRINGS[token], ms / 1000);
        expect(x).toBeGreaterThanOrEqual(previous - 1e-12);
        expect(x).toBeLessThanOrEqual(1);
        previous = x;
      }
    },
  );

  it('orders by duration', () => {
    const at = (token: keyof typeof SPRINGS) =>
      springPosition(SPRINGS[token], 0.2);
    expect(at('snappy')).toBeGreaterThan(at('smooth'));
    expect(at('smooth')).toBeGreaterThan(at('gentle'));
  });
});

describe('bouncy', () => {
  it('overshoots a little, for small controls only', () => {
    let peak = 0;
    for (let ms = 0; ms <= 2000; ms += 1)
      peak = Math.max(peak, springPosition(SPRINGS.bouncy, ms / 1000));
    // A damping ratio of 0.85 overshoots by well under 1 %.
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThan(1.02);
  });
});
