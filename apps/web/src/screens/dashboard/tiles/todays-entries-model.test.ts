import { describe, expect, it } from 'vitest';
import { seriesNumber } from './todays-entries-model.ts';

describe('seriesNumber', () => {
  it('reads the index of a series colour', () => {
    expect(seriesNumber('series-1')).toBe(1);
    expect(seriesNumber('series-8')).toBe(8);
  });

  it('rejects anything else', () => {
    expect(seriesNumber('series-9')).toBeUndefined();
    expect(seriesNumber('red')).toBeUndefined();
  });
});
