import { localDate } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { readDismissed, reviewDue } from './review-dismissal.ts';

describe('weekly review dismissal', () => {
  const day = localDate('2026-10-03');

  it('is due when never dismissed', () => {
    expect(reviewDue(null, day)).toBe(true);
  });

  it('stays hidden for a week after a dismissal', () => {
    expect(reviewDue(localDate('2026-10-03'), day)).toBe(false);
    expect(reviewDue(localDate('2026-09-28'), day)).toBe(false);
    expect(reviewDue(localDate('2026-09-26'), day)).toBe(true);
  });

  it('ignores a malformed or unreadable value', () => {
    expect(readDismissed({ getItem: () => 'soon' })).toBeNull();
    expect(
      readDismissed({
        getItem: () => {
          throw new Error('blocked');
        },
      }),
    ).toBeNull();
    expect(readDismissed({ getItem: () => '2026-10-01' })).toBe('2026-10-01');
  });
});
