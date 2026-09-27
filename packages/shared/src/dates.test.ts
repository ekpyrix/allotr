import { describe, expect, it } from 'vitest';
import { DateError, localDate, localDateSchema } from './dates.ts';

function errorCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    if (error instanceof DateError) return error.code;
    throw error;
  }
  return undefined;
}

describe('localDate', () => {
  it.each(['2026-01-31', '2024-02-29', '2000-02-29', '0001-01-01'])(
    'accepts %s',
    (text) => {
      expect(localDate(text)).toBe(text);
      expect(localDateSchema.parse(text)).toBe(text);
    },
  );

  it.each([
    '2026-02-29',
    '1900-02-29',
    '2026-04-31',
    '2026-13-01',
    '2026-00-10',
    '2026-01-00',
    '2026-1-5',
    '2026-01-05T00:00:00Z',
    ' 2026-01-05',
  ])('rejects %j', (text) => {
    expect(errorCode(() => localDate(text))).toBe('date.invalid');
    expect(localDateSchema.safeParse(text).success).toBe(false);
  });
});
