import { describe, expect, it } from 'vitest';
import { submitLine } from './submit.ts';

describe('submitLine', () => {
  it('ignores a blank line', () => {
    expect(submitLine('   ')).toEqual({ status: 'empty' });
  });

  it('keeps the trimmed line until the parser endpoint exists', () => {
    expect(submitLine(' -4 coffee @card ')).toEqual({
      status: 'unavailable',
      line: '-4 coffee @card',
    });
  });
});
