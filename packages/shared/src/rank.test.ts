import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isRank, RankError, rankBetween, rankSequence } from './rank.ts';

const rankArb = fc
  .stringMatching(/^[0-9A-Za-z]{0,6}[1-9A-Za-z]$/)
  .filter((key) => key.length <= 8);

describe('rankBetween', () => {
  it('starts in the middle of the range', () => {
    expect(rankBetween()).toBe('V');
  });

  it('places keys before and after', () => {
    expect(rankBetween(null, 'V') < 'V').toBe(true);
    expect(rankBetween('V', null) > 'V').toBe(true);
  });

  it('finds room between adjacent digits', () => {
    const key = rankBetween('A', 'B');
    expect(key > 'A' && key < 'B').toBe(true);
    expect(isRank(key)).toBe(true);
  });

  it('refuses keys out of order or malformed', () => {
    expect(() => rankBetween('B', 'A')).toThrow(RankError);
    expect(() => rankBetween('A', 'A')).toThrow(RankError);
    expect(() => rankBetween('A0', null)).toThrow(RankError);
    expect(() => rankBetween('', null)).toThrow(RankError);
  });

  it('always sorts strictly between its neighbours', () => {
    fc.assert(
      fc.property(
        fc.option(rankArb, { nil: null }),
        fc.option(rankArb, { nil: null }),
        (x, y) => {
          if (x !== null && y !== null && x === y) return;
          const [a, b] = x !== null && y !== null && y < x ? [y, x] : [x, y];
          const key = rankBetween(a, b);
          expect(isRank(key)).toBe(true);
          if (a !== null) expect(a < key).toBe(true);
          if (b !== null) expect(key < b).toBe(true);
        },
      ),
    );
  });

  it('keeps finding room after repeated inserts at one spot', () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { maxLength: 200 }), (sides) => {
        let low: string | null = null;
        let high: string | null = null;
        for (const left of sides) {
          const key = rankBetween(low, high);
          if (left) high = key;
          else low = key;
        }
        if (low !== null && high !== null) expect(low < high).toBe(true);
      }),
    );
  });
});

describe('rankSequence', () => {
  it('returns ascending valid keys', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer({ min: 0, max: 200 }),
          fc.constantFrom(61, 62, 3843, 3844, 50_000),
        ),
        (count) => {
          const keys = rankSequence(count);
          expect(keys).toHaveLength(count);
          // One expect per run, not per key, keeps 50,000 keys fast.
          const bad = keys.findIndex(
            (key, i) => !isRank(key) || (i > 0 && !((keys[i - 1] ?? '') < key)),
          );
          expect(bad).toBe(-1);
        },
      ),
      { numRuns: 50 },
    );
  });
});
