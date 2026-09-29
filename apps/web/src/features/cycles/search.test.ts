import { describe, expect, it } from 'vitest';
import { validateCycleSearch } from './search.ts';

describe('validateCycleSearch', () => {
  it('keeps a calendar day', () => {
    expect(validateCycleSearch({ start: '2026-03-01' })).toEqual({
      start: '2026-03-01',
    });
  });

  it('drops anything else, but keeps the key', () => {
    for (const start of ['2026-02-30', 'soon', 20260301, undefined]) {
      expect(validateCycleSearch({ start })).toEqual({ start: undefined });
    }
  });
});
