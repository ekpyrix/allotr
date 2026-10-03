import { money } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { budgetGroupsOn } from '../ledger/balances.ts';
import { budgetSwitch } from '../ledger/build.ts';
import { meta } from '../ledger/testing.ts';
import { dailyFiguresOn } from './daily.ts';
import {
  groupsOn,
  poolCounts,
  poolId,
  poolsOn,
  type Pool,
  type PoolMove,
  type PoolSetup,
} from './pools.ts';
import {
  card,
  cash,
  chart,
  day,
  openingUsd,
  savings,
  view,
} from './testing.ts';

// Pools with made-up accounts and amounts (docs/domain.md "Pools").

const budget = poolId('budget');
const saved = poolId('savings');
const emergency = poolId('emergency');

const emergencyPool: Pool = {
  id: emergency,
  name: 'Emergency',
  kind: 'savings',
  countsTowardDaily: false,
};

function setup(moves: readonly PoolMove[] = [], extra: Pool[] = []): PoolSetup {
  return {
    pools: [
      { id: budget, name: 'Budget', kind: 'spending', countsTowardDaily: true },
      { id: saved, name: 'Savings', kind: 'savings', countsTowardDaily: false },
      ...extra,
    ],
    defaults: { on: budget, off: saved },
    moves,
  };
}

function move(
  id: string,
  accountId: PoolMove['accountId'],
  pool: PoolMove['poolId'],
  on: string,
  at = '2026-03-10T12:00:00.000Z',
): PoolMove {
  return { id, accountId, poolId: pool, effectiveOn: day(on), createdAt: at };
}

describe('poolsOn', () => {
  it('puts accounts in the default pool of their budget group', () => {
    const pools = poolsOn(view([], { pools: setup() }), day('2026-03-10'));
    expect(pools.get(card)).toBe(budget);
    expect(pools.get(cash)).toBe(budget);
    expect(pools.get(savings)).toBe(saved);
  });

  it('works without pools in the view, as the two default pools', () => {
    const pools = poolsOn(view([]), day('2026-03-10'));
    expect(pools.get(card)).toBe(budget);
    expect(pools.get(savings)).toBe(saved);
  });

  it('applies a move from its day, not before', () => {
    const v = view([], {
      pools: setup(
        [move('m1', cash, emergency, '2026-03-12')],
        [emergencyPool],
      ),
    });
    expect(poolsOn(v, day('2026-03-11')).get(cash)).toBe(budget);
    expect(poolsOn(v, day('2026-03-12')).get(cash)).toBe(emergency);
  });

  it('lets the latest of a move and a budget switch win', () => {
    const toBudget = budgetSwitch(chart, [], meta('2026-03-15'), {
      accountId: savings,
      budgetGroup: 'on',
    });
    const v = view([toBudget], {
      pools: setup(
        [move('m1', savings, emergency, '2026-03-12')],
        [emergencyPool],
      ),
    });
    expect(poolsOn(v, day('2026-03-13')).get(savings)).toBe(emergency);
    expect(poolsOn(v, day('2026-03-15')).get(savings)).toBe(budget);
  });

  it('breaks ties on a day by creation time then ID', () => {
    const v = view([], {
      pools: setup(
        [
          move('b', cash, emergency, '2026-03-12', '2026-03-12T08:00:00.000Z'),
          move('a', cash, saved, '2026-03-12', '2026-03-12T09:00:00.000Z'),
        ],
        [emergencyPool],
      ),
    });
    expect(poolsOn(v, day('2026-03-12')).get(cash)).toBe(saved);
  });
});

describe('groupsOn', () => {
  it('matches the budget switches when only the default pools exist', () => {
    const toOff = budgetSwitch(chart, [], meta('2026-03-12'), {
      accountId: card,
      budgetGroup: 'off',
    });
    const v = view([toOff]);
    for (const date of ['2026-03-11', '2026-03-12', '2026-03-20']) {
      expect(groupsOn(v, day(date))).toEqual(
        budgetGroupsOn(chart, [toOff], day(date)),
      );
    }
  });

  it('never counts a savings pool unless the setting is on', () => {
    const counting: Pool = { ...emergencyPool, countsTowardDaily: true };
    const moves = [move('m1', cash, emergency, '2026-03-01')];
    const off = view([], { pools: setup(moves, [counting]) });
    expect(groupsOn(off, day('2026-03-10')).get(cash)).toBe('off');
    const on = view([], {
      pools: setup(moves, [counting]),
      settings: { ...off.settings, countSavingsInDaily: true },
    });
    expect(groupsOn(on, day('2026-03-10')).get(cash)).toBe('on');
  });

  it('needs the pool switch as well as the setting', () => {
    expect(poolCounts(emergencyPool, true)).toBe(false);
    expect(
      poolCounts({ ...emergencyPool, countsTowardDaily: true }, false),
    ).toBe(false);
  });

  it('counts an account in an unknown pool as off budget', () => {
    const v = view([], {
      pools: setup([move('m1', cash, poolId('gone'), '2026-03-01')]),
    });
    expect(groupsOn(v, day('2026-03-10')).get(cash)).toBe('off');
  });
});

describe('daily figures with pools', () => {
  const ledger = [
    openingUsd('2026-03-01', 100_000, card),
    openingUsd('2026-03-01', 50_000, cash),
  ];

  it('leaves a moved account out of the daily number from its day', () => {
    const v = view(ledger, {
      pools: setup(
        [move('m1', cash, emergency, '2026-03-10')],
        [emergencyPool],
      ),
    });
    expect(dailyFiguresOn(v, day('2026-03-09')).onBudget).toEqual(
      money(150_000, 'USD'),
    );
    expect(dailyFiguresOn(v, day('2026-03-10')).onBudget).toEqual(
      money(100_000, 'USD'),
    );
  });

  it('changes past figures when a move is back-dated', () => {
    const before = view(ledger);
    const after = view(ledger, {
      pools: setup(
        [move('m1', cash, emergency, '2026-03-02')],
        [emergencyPool],
      ),
    });
    expect(dailyFiguresOn(before, day('2026-03-05')).onBudget.amountMinor).toBe(
      150_000,
    );
    expect(dailyFiguresOn(after, day('2026-03-05')).onBudget.amountMinor).toBe(
      100_000,
    );
  });
});
