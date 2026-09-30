import { addDays, isoWeekday, localDate, type LocalDate } from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cyclesOf } from './cycles.ts';
import { lastWorkingDayOfMonth, nextPayday } from './payday.ts';
import { day, paycheck, settings, view } from './testing.ts';

const dateArb = fc
  .integer({ min: 0, max: 365 * 12 })
  .map((n) => addDays(localDate('2020-01-01'), n));
const ruleArb = fc.constantFrom('fixed', 'last-working-day', 'manual' as const);
const dayArb = fc.integer({ min: 1, max: 31 });

describe('lastWorkingDayOfMonth', () => {
  it('rolls a weekend month end back to Friday', () => {
    // 2026-01-31 is a Saturday, 2026-05-31 a Sunday, 2026-03-31 a Tuesday.
    expect(lastWorkingDayOfMonth(day('2026-01-10'))).toBe('2026-01-30');
    expect(lastWorkingDayOfMonth(day('2026-05-01'))).toBe('2026-05-29');
    expect(lastWorkingDayOfMonth(day('2026-03-15'))).toBe('2026-03-31');
  });
});

describe('nextPayday', () => {
  it('fixed uses the day of the month, shorter months use their last day', () => {
    expect(nextPayday('fixed', 25, day('2026-03-10'))).toBe('2026-03-25');
    expect(nextPayday('fixed', 25, day('2026-03-25'))).toBe('2026-04-25');
    expect(nextPayday('fixed', 31, day('2026-02-01'))).toBe('2026-02-28');
  });

  it('manual falls back to the day until the date is set', () => {
    expect(nextPayday('manual', 10, day('2026-03-10'))).toBe('2026-04-10');
  });

  it('last-working-day moves to next month once this month has passed', () => {
    expect(nextPayday('last-working-day', 1, day('2026-01-30'))).toBe(
      '2026-02-27',
    );
    expect(nextPayday('last-working-day', 1, day('2026-01-31'))).toBe(
      '2026-02-27',
    );
    expect(nextPayday('last-working-day', 1, day('2026-12-31'))).toBe(
      '2027-01-29',
    );
  });

  it('is after the given day, within 35 days, for every rule', () => {
    fc.assert(
      fc.property(ruleArb, dayArb, dateArb, (rule, d, after) => {
        const next = nextPayday(rule, d, after);
        expect(next > after).toBe(true);
        expect(next <= addDays(after, 35)).toBe(true);
      }),
    );
  });

  it('last-working-day always lands on a weekday, the last of its month', () => {
    fc.assert(
      fc.property(dayArb, dateArb, (d, after) => {
        const next = nextPayday('last-working-day', d, after);
        expect(isoWeekday(next)).toBeLessThanOrEqual(5);
        // No later weekday shares its month.
        for (let n = 1; n <= 3; n += 1) {
          const later: LocalDate = addDays(next, n);
          if (later.slice(0, 7) === next.slice(0, 7)) {
            expect(isoWeekday(later)).toBeGreaterThan(5);
          }
        }
      }),
    );
  });

  it('is monotonic: a later start never gives an earlier payday', () => {
    fc.assert(
      fc.property(ruleArb, dayArb, dateArb, fc.nat(60), (rule, d, a, n) => {
        expect(
          nextPayday(rule, d, addDays(a, n)) >= nextPayday(rule, d, a),
        ).toBe(true);
      }),
    );
  });
});

describe('cyclesOf with a payday rule', () => {
  it('runs a cycle to the last working day and reopens on the paycheck', () => {
    const rule = settings({
      paydayRule: 'last-working-day',
      startedOn: day('2026-01-05'),
    });
    const ledger = [paycheck('2026-01-30', 150000)];
    const cycles = cyclesOf(
      view(ledger, { settings: rule }),
      day('2026-02-10'),
    );
    expect(cycles.map((c) => [c.openedOn, c.payday])).toEqual([
      ['2026-01-05', '2026-01-30'],
      ['2026-01-30', '2026-02-27'],
    ]);
  });

  it('lets a date set for the cycle beat the rule', () => {
    const rule = settings({
      paydayRule: 'manual',
      paydayDay: 20,
      paydayOverride: day('2026-03-14'),
      startedOn: day('2026-03-01'),
    });
    const [open] = cyclesOf(view([], { settings: rule }), day('2026-03-05'));
    expect(open?.payday).toBe('2026-03-14');
  });
});
