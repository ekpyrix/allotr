import { addDays, localDate, money, type LocalDate } from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { poolCycleFigures } from './pool-cycle.ts';
import { poolId } from './pools.ts';
import {
  card,
  openingUsd,
  paycheck,
  savings,
  settings,
  spend,
  view,
} from './testing.ts';

// Invariants of pool cycle figures under random entries: savings never get
// figures, start takes in the cycle's income, start less left is what was
// spent, and the order entries arrive in changes nothing.

const budget = poolId('budget');
const saved = poolId('savings');
const today = localDate('2026-03-20');
const opened = localDate('2026-03-01');

const entryArb: fc.Arbitrary<Entry> = fc.record({
  kind: fc.constantFrom('spend', 'income'),
  amount: fc.integer({ min: 1, max: 50_000 }),
  // After the paycheck that opens the cycle, up to today.
  day: fc.integer({ min: 1, max: 19 }).map((n) => addDays(opened, n)),
});

type Entry = Readonly<{
  kind: 'spend' | 'income';
  amount: number;
  day: LocalDate;
}>;

function ledgerOf(entries: readonly Entry[]) {
  return [
    openingUsd('2026-02-18', 100_000, card),
    openingUsd('2026-02-18', 700_000, savings),
    paycheck('2026-03-01', 200_000),
    ...entries.map((e) =>
      e.kind === 'spend' ? spend(e.day, e.amount) : paycheck(e.day, e.amount),
    ),
  ];
}

describe('pool cycle figure properties', () => {
  it('never gives savings figures, whatever the setting', () => {
    fc.assert(
      fc.property(
        fc.array(entryArb, { maxLength: 10 }),
        fc.boolean(),
        (entries, countSavings) => {
          const v = view(ledgerOf(entries), {
            settings: settings({ countSavingsInDaily: countSavings }),
          });
          expect(poolCycleFigures(v, today).has(saved)).toBe(false);
        },
      ),
    );
  });

  it('starts with the cycle income and parts from left by what was spent', () => {
    fc.assert(
      fc.property(fc.array(entryArb, { maxLength: 10 }), (entries) => {
        const figures = poolCycleFigures(view(ledgerOf(entries)), today);
        const total = (kind: Entry['kind']) =>
          entries
            .filter((e) => e.kind === kind)
            .reduce((sum, e) => sum + e.amount, 0);
        const start = 100_000 + 200_000 + total('income');
        expect(figures.get(budget)).toEqual({
          start: [money(start, 'USD')],
          left: [money(start - total('spend'), 'USD')],
        });
      }),
    );
  });

  it('gives the same figures whatever order the ledger arrives in', () => {
    fc.assert(
      fc.property(
        fc.array(entryArb, { maxLength: 10 }),
        fc.nat(),
        (entries, seed) => {
          const ledger = ledgerOf(entries);
          const cut = seed % ledger.length;
          const turned = [
            ...ledger.slice(cut),
            ...ledger.slice(0, cut),
          ].reverse();
          expect(poolCycleFigures(view(turned), today)).toEqual(
            poolCycleFigures(view(ledger), today),
          );
        },
      ),
    );
  });
});
