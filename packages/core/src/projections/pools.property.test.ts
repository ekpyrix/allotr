import { addDays, localDate } from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { budgetGroupsOn } from '../ledger/balances.ts';
import { testChart } from '../ledger/testing.ts';
import { dailyFiguresOn } from './daily.ts';
import {
  groupsOn,
  poolId,
  poolsOn,
  type Pool,
  type PoolMove,
  type PoolSetup,
} from './pools.ts';
import { settings, view } from './testing.ts';

// Invariants of pools under random moves and settings: the core promise
// (savings are never counted by accident) and invariant 8 (same inputs, same
// figures, whatever order they arrive in).

const chart = testChart();
const userAccounts = [...chart.values()].filter((a) => a.systemRole === null);
const start = localDate('2026-03-01');

const pools: Pool[] = [
  {
    id: poolId('budget'),
    name: 'Budget',
    kind: 'spending',
    countsTowardDaily: true,
  },
  {
    id: poolId('savings'),
    name: 'Savings',
    kind: 'savings',
    countsTowardDaily: false,
  },
  {
    id: poolId('spare'),
    name: 'Spare',
    kind: 'spending',
    countsTowardDaily: false,
  },
  {
    id: poolId('emergency'),
    name: 'Emergency',
    kind: 'savings',
    countsTowardDaily: true,
  },
];

const moveArb = fc.record({
  id: fc.uuid(),
  accountId: fc.constantFrom(...userAccounts.map((a) => a.id)),
  poolId: fc.constantFrom(...pools.map((p) => p.id)),
  effectiveOn: fc.nat(40).map((n) => addDays(start, n)),
  createdAt: fc
    .nat(1000)
    .map((n) => `2026-03-01T00:00:00.${String(n).padStart(3, '0')}Z`),
}) satisfies fc.Arbitrary<PoolMove>;

function setupWith(moves: readonly PoolMove[]): PoolSetup {
  return {
    pools,
    defaults: {
      on: pools[0]?.id ?? poolId(''),
      off: pools[1]?.id ?? poolId(''),
    },
    moves,
  };
}

const dateArb = fc.nat(50).map((n) => addDays(start, n));

describe('pool properties', () => {
  it('never counts a savings pool while the setting is off', () => {
    fc.assert(
      fc.property(
        fc.array(moveArb, { maxLength: 12 }),
        dateArb,
        (moves, date) => {
          const v = view([], { pools: setupWith(moves) });
          const groups = groupsOn(v, date);
          for (const [account, pool] of poolsOn(v, date)) {
            const kind = pools.find((p) => p.id === pool)?.kind;
            if (kind === 'savings') expect(groups.get(account)).toBe('off');
          }
        },
      ),
    );
  });

  it('puts every user account in exactly one pool on every day', () => {
    fc.assert(
      fc.property(
        fc.array(moveArb, { maxLength: 12 }),
        dateArb,
        (moves, date) => {
          const placed = poolsOn(view([], { pools: setupWith(moves) }), date);
          expect([...placed.keys()].sort()).toEqual(
            userAccounts.map((a) => a.id).sort(),
          );
        },
      ),
    );
  });

  it('does not depend on the order moves arrive in', () => {
    fc.assert(
      fc.property(
        fc.array(moveArb, { maxLength: 12 }),
        fc.boolean(),
        dateArb,
        fc.boolean(),
        (moves, setting, date, reverseOrder) => {
          const ledgerSettings = settings({ countSavingsInDaily: setting });
          const a = view([], {
            pools: setupWith(moves),
            settings: ledgerSettings,
          });
          const b = view([], {
            pools: setupWith(reverseOrder ? [...moves].reverse() : moves),
            settings: ledgerSettings,
          });
          expect(groupsOn(a, date)).toEqual(groupsOn(b, date));
          expect(dailyFiguresOn(a, date).onBudget).toEqual(
            dailyFiguresOn(b, date).onBudget,
          );
        },
      ),
    );
  });

  it('matches the budget switches when no pool moves exist', () => {
    fc.assert(
      fc.property(dateArb, (date) => {
        const v = view([]);
        expect(groupsOn(v, date)).toEqual(budgetGroupsOn(chart, [], date));
      }),
    );
  });
});
