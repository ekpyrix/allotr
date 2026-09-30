import { describe, expect, it } from 'vitest';
import { validateCycleSearch } from './search.ts';

describe('validateCycleSearch', () => {
  it('keeps a calendar day and a tab', () => {
    expect(validateCycleSearch({ start: '2026-03-01', tab: 'days' })).toEqual({
      start: '2026-03-01',
      tab: 'days',
    });
  });

  it('drops anything else, but keeps the keys', () => {
    for (const start of ['2026-02-30', 'soon', 20260301, undefined]) {
      expect(validateCycleSearch({ start })).toEqual({
        start: undefined,
        tab: undefined,
      });
    }
    for (const tab of ['overview', 'charts', 3, undefined]) {
      expect(validateCycleSearch({ tab })).toEqual({
        start: undefined,
        tab: undefined,
      });
    }
  });
});
