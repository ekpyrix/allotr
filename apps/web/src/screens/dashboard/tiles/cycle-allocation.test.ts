import { money } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { allocationSegments, segmentShare } from './cycle-allocation.ts';

const m = (n: number) => money(n, 'USD');
const labels = {
  paidBills: 'a',
  savings: 'b',
  spent: 'c',
  reserved: 'd',
  free: 'e',
};

describe('segmentShare', () => {
  it('is the part over the start', () => {
    expect(segmentShare(m(250), m(1000))).toBe(0.25);
  });
  it('is empty for negative parts and a non-positive start', () => {
    expect(segmentShare(m(-5), m(1000))).toBe(0);
    expect(segmentShare(m(5), m(0))).toBe(0);
    expect(segmentShare(m(5), m(-10))).toBe(0);
  });
});

describe('allocationSegments', () => {
  it('keeps the order with the money left last', () => {
    const segments = allocationSegments(
      {
        start: m(1000),
        paidBills: m(100),
        savings: m(-50),
        spent: m(300),
        reserved: m(200),
        free: m(450),
      },
      labels,
    );
    expect(segments.map((s) => s.id)).toEqual([
      'paidBills',
      'savings',
      'spent',
      'reserved',
      'free',
    ]);
    expect(segments[1]?.fraction).toBe(0);
    expect(segments[4]?.fraction).toBe(0.45);
  });
});
